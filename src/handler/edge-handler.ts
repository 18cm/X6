import * as routers from '../router'
import * as util from '../util'
import { Cell, State, Graph } from '../core'
import { Rectangle, Point, Constraint } from '../struct'
import { Shape, RectangleShape } from '../shape'
import { MouseHandler } from './handler-mouse'
import { CellMarker } from './cell-marker'
import { ConstraintHandler } from './constraint-handler'
import { Handle } from './handle'
import {
  detector,
  constants,
  DomEvent,
  MouseEventEx,
  IDisposable,
  Disposable,
} from '../common'
import {
  ConnectionOptions,
  applySelectionPreviewStyle,
  createEdgeHandle,
  getEdgeHandleCursor,
  createLabelHandle,
  getLabelHandleCursor,
  getLabelHandleOffset,
  getSelectionPreviewCursor,
  getEdgeHandleOptions,
  getConnectionHighlightOptions,
} from '../option'

export class EdgeHandler extends MouseHandler {
  state: State
  handles: Shape[] | null = null
  virtualHandles: Shape[] | null = null
  preferHtml: boolean = false

  marker: CellMarker
  constraintHandler: ConstraintHandler
  previewShape: Shape | null
  parentHighlight: RectangleShape | null
  labelPos: Point | null
  labelHandleShape: Shape | null
  error: string | null = null

  /**
   * Specifies if cloning by control-drag is enabled.
   *
   * Default is `true`.
   */
  cloneable: boolean = true

  /**
   * Specifies if adding handles by shift-click is enabled.
   *
   * Default is `false`.
   */
  addable: boolean = false

  /**
   * Specifies if removing handles by shift-click is enabled.
   *
   * Default is `false`.
   */
  removable: boolean = false

  /**
   * Specifies if removing handles by double click is enabled.
   *
   * Default is `false`.
   */
  dblClickRemoveEnabled: boolean = false

  /**
   * Specifies if removing handles by dropping them on other handles is enabled.
   *
   * Default is `false`.
   */
  mergeRemoveEnabled: boolean = false

  /**
   * Specifies if removing handles by creating straight segments is enabled.
   *
   * If enabled, this can be overridden by holding down the alt key while
   * moving.
   *
   * Default is `false`.
   */
  straightRemoveEnabled: boolean = false

  /**
   * Specifies if virtual handles should be added in the center of each
   * segments. These handles can then be used to add new waypoints.
   *
   * Default is `false`.
   */
  virtualHandlesEnabled: boolean = false

  /**
   * Specifies if the label handle should be moved if it intersects with
   * another handle.
   *
   * Default is `false`.
   */
  manageLabelHandle: boolean = false

  /**
   * Specifies if the parent should be highlighted if a child cell is selected.
   *
   * Default is `false`.
   */
  parentHighlightEnabled: boolean = false

  /**
   * Specifies if waypoints should snap to the routing centers of terminals.
   *
   * Default is `false`.
   */
  snapToTerminals: boolean = false

  /**
   * Optional tolerance for hit-detection.
   *
   * Default is `0`.
   */
  tolerance = 0

  /**
   * Specifies if the bounds of handles should be used for hit-detection in IE.
   *
   * Default is `true`.
   */
  checkHandleBounds: boolean = true

  /**
   * Specifies if connections to the outline of a highlighted target should be
   * enabled. This will allow to place the connection point along the outline
   * of the highlighted target.
   *
   * Default is `false`.
   */
  outlineConnect: boolean = false

  protected escapeHandler: (() => void) | null
  protected customHandles: Handle[] | null
  protected points: Point[] | null
  protected absolutePoints: Point[]
  protected snapPoint: Point | null
  protected startX: number
  protected startY: number
  protected index: number | null
  protected active: boolean

  isSourceHandle: boolean
  isTargetHandle: boolean
  isLabelHandle: boolean
  currentPoint: Point

  constructor(graph: Graph, state: State) {
    super(graph)
    this.state = state
    this.config()
    this.init()

    this.escapeHandler = () => {
      const dirty = this.index != null
      this.reset()
      if (dirty) {
        this.graph.renderer.redraw(this.state, false, state.view.isRendering())
      }
    }

    this.state.view.graph.on(Graph.events.escape, this.escapeHandler)
  }

  config() {
    const options = this.graph.options.connection as ConnectionOptions
    this.outlineConnect = options.outlineConnect
    const opts = getEdgeHandleOptions({
      graph: this.graph,
      cell: this.state.cell,
    })
    this.addable = opts.addable
    this.removable = opts.removable
    this.dblClickRemoveEnabled = opts.dblClickRemoveEnabled
    this.mergeRemoveEnabled = opts.mergeRemoveEnabled
    this.straightRemoveEnabled = opts.straightRemoveEnabled
    this.virtualHandlesEnabled = opts.virtualHandlesEnabled
    this.manageLabelHandle = opts.manageLabelHandle
  }

  init() {
    this.marker = new EdgeHandler.EdgeHandlerMarker(this.graph, this)
    this.constraintHandler = new ConstraintHandler(this.graph)

    // Clones the original points from the cell
    // and makes sure at least one point exists
    this.points = []

    // Uses the absolute points of the state
    // for the initial configuration and preview
    this.absolutePoints = this.getSelectionPoints(this.state)
    this.previewShape = this.createSelectionShape(this.absolutePoints)
    this.previewShape.pointerEvents = false
    this.previewShape.init(this.graph.view.getOverlayPane())

    MouseEventEx.redirectMouseEvents(
      this.previewShape.elem, this.graph, this.state,
    )

    // Updates preferHtml
    this.preferHtml = this.isPreferHtml()

    // Adds highlight for parent group
    if (this.parentHighlightEnabled) {
      const parent = this.graph.model.getParent(this.state.cell)
      if (this.graph.model.isNode(parent)) {
        const pstate = this.graph.view.getState(parent)
        if (pstate != null) {
          this.parentHighlight = this.createParentHighlightShape(pstate.bounds)
          this.parentHighlight.pointerEvents = false
          this.parentHighlight.rotation = util.getRotation(pstate)
          this.parentHighlight.init(this.graph.view.getOverlayPane())
        }
      }
    }

    // Creates bends for the non-routed absolute points
    // or bends that don't correspond to points
    const maxCellCount = this.graph.graphHandler.maxCellCount
    if (maxCellCount <= 0 || this.graph.getSelecedCellCount() < maxCellCount) {
      this.handles = this.createHandles()
      if (this.isVirtualHandlesEnabled()) {
        this.virtualHandles = this.createVirtualHandles()
      }
    }

    // Adds a rectangular handle for the label position
    this.labelPos = this.state.absoluteOffset.clone()
    this.labelHandleShape = this.createLabelHandleShape()
    this.initHandle(this.labelHandleShape)

    this.customHandles = this.createCustomHandles()

    this.redraw()
  }

  protected getSelectionPoints(state: State) {
    return state.absolutePoints
  }

  protected createParentHighlightShape(bounds: Rectangle) {
    const shape = new RectangleShape(bounds)
    applySelectionPreviewStyle({
      shape,
      graph: this.graph,
      cell: this.state.cell,
    })
    return shape
  }

  protected createSelectionShape(points: Point[]) {
    const ctor = this.state.shape!.constructor
    return new (ctor as any)() as Shape
  }

  protected isPreferHtml() {
    let preferHtml = util.hasHtmlLabel(this.state)
    if (!preferHtml) {
      preferHtml = util.hasHtmlLabel(this.state.getVisibleTerminalState(true))
    }

    if (!preferHtml) {
      preferHtml = util.hasHtmlLabel(this.state.getVisibleTerminalState(false))
    }

    return preferHtml
  }

  isConnectableCell(cell: Cell | null) {
    return true
  }

  validateConnection(source: Cell | null, target: Cell | null) {
    return this.graph.validator.getEdgeValidationError(
      this.state.cell, source, target,
    )
  }

  protected getCellAt(x: number, y: number) {
    return (!this.outlineConnect) ? this.graph.getCellAt(x, y) : null
  }

  protected createHandles() {
    const handles = []
    const cell = this.state.cell
    const len = this.absolutePoints.length
    const bendable = this.graph.isCellBendable(cell)

    for (let i = 0; i < len; i += 1) {
      if (this.isHandleVisible(i)) {
        const isSource = i === 0
        const isTarget = i === len - 1
        const isTerminal = isSource || isTarget

        if (isTerminal || bendable) {
          const handle = this.createHandleShape(i)
          const dblClick = (index => () => {
            if (this.dblClickRemoveEnabled) {
              this.removePoint(this.state, index)
            }
          })(i)

          this.initHandle(handle, dblClick)

          if (this.isHandleEnabled(i)) {
            const cursor = getEdgeHandleCursor({
              isSource,
              isTarget,
              index: i,
              graph: this.graph,
              cell: this.state.cell,
              shape: handle,
            })
            if (cursor != null) {
              handle.setCursor(cursor)
            }
          }

          handles.push(handle)

          if (!isTerminal) {
            this.points!.push(new Point(0, 0))
            handle.elem!.style.visibility = 'hidden'
          }
        }
      }
    }

    return handles
  }

  protected isVirtualHandlesEnabled() {
    return this.virtualHandlesEnabled && (
      this.state.style.edge == null ||
      this.state.style.edge === constants.NONE ||
      this.state.style.noEdgeStyle === true
    ) &&
      this.state.style.shape !== 'arrow'
  }

  protected createVirtualHandles() {
    const cell = this.state.cell
    const handles = []

    if (this.graph.isCellBendable(cell)) {
      for (let i = 1, ii = this.absolutePoints.length; i < ii; i += 1) {
        const handle = this.createHandleShape(i, true)
        this.initHandle(handle)
        const cursor = getEdgeHandleCursor({
          graph: this.graph,
          cell: this.state.cell,
          index: i,
          shape: handle,
          visual: true,
        })
        if (cursor != null) {
          handle.setCursor(cursor)
        }
        handles.push(handle)
      }
    }

    return handles
  }

  protected isHandleVisible(index: number) {
    if (index === 0 || index === this.absolutePoints.length - 1) {
      return true
    }

    const geo = this.graph.getCellGeometry(this.state.cell)
    const sourceState = this.state.getVisibleTerminalState(true)
    const targetState = this.state.getVisibleTerminalState(false)
    const edgeFn = (geo != null) ? this.graph.view.getEdgeFunction(
      this.state, geo.points, sourceState, targetState,
    ) : null

    return edgeFn !== routers.entityRelation
  }

  protected isHandleEnabled(index: number) {
    return true
  }

  /**
   * Creates the shape used to display the given bend.
   *
   * Note that the index may be `null` for special cases, such as when
   * called from `createVirtualBend`. Only images and rectangles should be
   * returned if support for HTML labels with not foreign objects is required.
   */
  protected createHandleShape(index?: number | null, visual = false): Shape {
    return createEdgeHandle({
      visual,
      graph: this.graph,
      cell: this.state.cell,
      index: index != null ? index : null,
    })
  }

  protected createLabelHandleShape() {
    const args = {
      graph: this.graph,
      cell: this.state.cell,
    }
    const handle = createLabelHandle(args)
    const cursor = getLabelHandleCursor({ ...args, shape: handle })
    handle.cursor = cursor
    return handle
  }

  protected initHandle(
    handle: Shape,
    dblClick?: (evt: MouseEvent) => void,
  ) {
    if (this.preferHtml) {
      handle.dialect = 'html'
      handle.init(this.graph.container)
    } else {
      handle.dialect = 'svg'
      handle.init(this.graph.view.getOverlayPane())
    }

    MouseEventEx.redirectMouseEvents(
      handle.elem, this.graph, this.state,
      null, null, null, dblClick,
    )

    if (detector.SUPPORT_TOUCH) {
      handle.elem!.setAttribute('pointer-events', 'none')
    }
  }

  protected createCustomHandles() {
    return null
  }

  /**
   * Returns true if the given event is a trigger to add a new point.
   * This implementation returns `true` if shift is pressed.
   */
  protected isAddPointEvent(evt: MouseEvent) {
    return DomEvent.isShiftDown(evt)
  }

  /**
   * Returns true if the given event is a trigger to remove a point.
   * This implementation returns `true` if shift is pressed.
   */
  protected isRemovePointEvent(evt: MouseEvent) {
    return DomEvent.isShiftDown(evt)
  }

  /**
   * Returns true if the given event allows virtual bends to be added.
   */
  protected isAddVirtualBendEvent(e: MouseEventEx) {
    return true
  }

  /**
   * Returns true if the given event allows custom handles to be changed.
   */
  protected isCustomHandleEvent(e: MouseEventEx) {
    return true
  }

  protected isSnapToTerminalsEvent(e: MouseEventEx) {
    return this.snapToTerminals && !DomEvent.isAltDown(e.getEvent())
  }

  protected getHandleForEvent(e: MouseEventEx) {
    const tol = DomEvent.isMouseEvent(e.getEvent()) ? 1 : this.tolerance
    const hit = (this.checkHandleBounds && (detector.IS_IE || tol > 0))
      ? new Rectangle(
        e.getGraphX() - tol,
        e.getGraphY() - tol,
        2 * tol,
        2 * tol,
      )
      : null

    let minDist: number | null = null
    let result = null

    function checkShape(shape: Shape | null) {
      if (
        shape && util.isVisible(shape.elem) &&
        (
          e.isSource(shape) ||
          (hit && shape.bounds.isIntersectWith(hit))
        )
      ) {
        const dx = e.getGraphX() - shape.bounds.getCenterX()
        const dy = e.getGraphY() - shape.bounds.getCenterY()
        const tmp = dx * dx + dy * dy

        if (minDist == null || tmp <= minDist) {
          minDist = tmp
          return true
        }
      }

      return false
    }

    if (this.customHandles && this.isCustomHandleEvent(e)) {
      // Inverse loop order to match display order
      for (let i = this.customHandles.length - 1; i >= 0; i -= 1) {
        if (checkShape(this.customHandles[i].shape)) {
          return DomEvent.getCustomHandle(i)
        }
      }
    }

    if (e.isSource(this.state.text) || checkShape(this.labelHandleShape)) {
      result = DomEvent.getLabelHandle()
    }

    if (this.handles != null) {
      for (let i = 0, ii = this.handles.length; i < ii; i += 1) {
        if (checkShape(this.handles[i])) {
          result = i
        }
      }
    }

    if (this.virtualHandles != null && this.isAddVirtualBendEvent(e)) {
      for (let i = 0, ii = this.virtualHandles.length; i < ii; i += 1) {
        if (checkShape(this.virtualHandles[i])) {
          result = DomEvent.getVisualHandle(i)
        }
      }
    }

    return result
  }

  /**
   * Handles the event by checking if a special element of the handler
   * was clicked, in which case the index parameter is non-null. The
   * indices may be one of <LABEL_HANDLE> or the number of the respective
   * control point. The source and target points are used for reconnecting
   * the edge.
   */
  mouseDown(e: MouseEventEx) {
    const index = this.getHandleForEvent(e)
    if (this.handles != null && index != null && this.handles[index] != null) {
      this.snapPoint = this.handles[index].bounds.getCenter()
    }

    if (this.addable && index == null && this.isAddPointEvent(e.getEvent())) {

      this.addPoint(this.state, e.getEvent())
      e.consume()

    } else if (index != null && !e.isConsumed() && this.graph.isEnabled()) {

      if (this.removable && this.isRemovePointEvent(e.getEvent())) {
        this.removePoint(this.state, index)
      } else if (
        !DomEvent.isLabelHandle(index) ||
        this.graph.isLabelMovable(e.getCell())
      ) {

        if (DomEvent.isVisualHandle(index) && this.virtualHandles) {
          const handle = this.virtualHandles[DomEvent.getVisualHandle(index)]
          handle.elem!.style.opacity = '100'
        }

        this.start(e.getClientX(), e.getClientY(), index)
      }

      e.consume()
    }
  }

  /**
   * Adds a control point for the given state and event.
   */
  protected addPoint(state: State, evt: MouseEvent) {
    const pt = util.clientToGraph(this.graph.container, evt)
    const gridEnabled = this.graph.isGridEnabledForEvent(evt)
    this.convertPoint(pt, gridEnabled)
    this.addPointAt(state, pt.x, pt.y)
    DomEvent.consume(evt)
  }

  /**
   * Adds a control point at the given point.
   */
  protected addPointAt(state: State, x: number, y: number) {
    let geo = this.graph.getCellGeometry(state.cell)
    if (geo != null) {
      geo = geo.clone()
      const t = this.graph.view.translate
      const s = this.graph.view.scale
      const p = new Point(x, y)
      let offset = new Point(t.x * s, t.y * s)

      const parent = this.graph.model.getParent(this.state.cell)
      if (this.graph.model.isNode(parent)) {
        const pState = this.graph.view.getState(parent)
        if (pState) {
          offset = new Point(pState.bounds.x, pState.bounds.y)
        }
      }

      const index = util.findNearestSegment(
        state,
        p.x * s + offset.x,
        p.y * s + offset.y,
      )

      if (geo.points == null) {
        geo.points = [p]
      } else {
        geo.points.splice(index, 0, p)
      }

      this.graph.model.setGeometry(state.cell, geo)
      this.refresh()
      this.redraw()
    }
  }

  /**
   * Removes the control point at the given index from the given state.
   */
  protected removePoint(state: State, index: number) {
    if (index > 0 && index < this.absolutePoints.length - 1) {
      let geo = this.graph.getCellGeometry(this.state.cell)
      if (geo != null && geo.points != null) {
        geo = geo.clone()
        geo.points.splice(index - 1, 1)
        this.graph.model.setGeometry(state.cell, geo)
        this.refresh()
        this.redraw()
      }
    }
  }

  protected start(x: number, y: number, index: number) {
    this.startX = x
    this.startY = y
    this.isLabelHandle = DomEvent.isLabelHandle(index)
    this.isSourceHandle = this.handles ? index === 0 : false
    this.isTargetHandle = this.handles ? index === this.handles.length - 1 : false

    if (this.isSourceHandle || this.isTargetHandle) {
      const cell = this.state.cell
      const terminal = this.graph.model.getTerminal(cell, this.isSourceHandle)

      if (
        (terminal == null && this.graph.isTerminalPointMovable(cell, this.isSourceHandle)) ||
        (terminal != null && this.graph.isCellDisconnectable(cell, terminal, this.isSourceHandle))
      ) {
        this.index = index
      }
    } else {
      this.index = index
    }

    // Hides other custom handles
    if (this.index != null) {
      if (DomEvent.isCustomHandle(this.index)) {
        if (this.customHandles != null) {
          const idx = DomEvent.getCustomHandle(this.index)
          for (let i = 0, ii = this.customHandles.length; i < ii; i += 1) {
            if (i !== idx) {
              this.customHandles[i].setVisible(false)
            }
          }
        }
      }
    }
  }

  mouseMove(e: MouseEventEx) {
    if (this.index != null && this.marker != null) {
      this.error = null
      this.currentPoint = this.getPointForEvent(e)

      const evt = e.getEvent()

      // Uses the current point from the constraint handler if available
      if (
        !this.graph.isConnectionIgnored(evt) &&
        DomEvent.isShiftDown(evt) &&
        this.snapPoint != null
      ) {
        if (
          Math.abs(this.snapPoint.x - this.currentPoint.x) <
          Math.abs(this.snapPoint.y - this.currentPoint.y)
        ) {
          this.currentPoint.x = this.snapPoint.x
        } else {
          this.currentPoint.y = this.snapPoint.y
        }
      }

      if (DomEvent.isCustomHandle(this.index)) {
        if (this.customHandles != null) {
          const idx = DomEvent.getCustomHandle(this.index)
          this.customHandles[idx].processEvent(e)
        }
      } else if (this.isLabelHandle) {

        this.labelPos!.x = this.currentPoint.x
        this.labelPos!.y = this.currentPoint.y

      } else {

        let outline = false
        this.points = this.getPreviewPoints(this.currentPoint, e)!
        let terminalState = (this.isSourceHandle || this.isTargetHandle)
          ? this.getPreviewTerminalState(e)
          : null

        if (
          this.constraintHandler.currentConstraint != null &&
          this.constraintHandler.currentState != null &&
          this.constraintHandler.currentPoint != null
        ) {

          this.currentPoint = this.constraintHandler.currentPoint.clone()

        } else if (this.outlineConnect) {

          // Need to check outline before cloning terminal state
          outline = (this.isSourceHandle || this.isTargetHandle)
            ? this.isOutlineConnectEvent(e)
            : false

          if (outline) {
            terminalState = this.marker.highlight.state
          } else if (
            terminalState != null &&
            terminalState !== e.getState() &&
            this.marker.highlight.shape != null
          ) {
            this.marker.highlight.shape.stroke = 'transparent'
            this.marker.highlight.repaint()
            terminalState = null
          }
        }

        if (
          terminalState != null &&
          this.graph.isCellLocked(terminalState.cell)
        ) {
          terminalState = null
          this.marker.reset()
        }

        const clone = this.clonePreviewState(
          this.currentPoint,
          (terminalState != null) ? terminalState.cell : null,
        )

        this.updatePreviewState(
          clone, this.currentPoint, terminalState, e, outline,
        )

        // Sets the color of the preview to valid or invalid, updates the
        // points of the preview and redraws
        const color = (this.error == null)
          ? this.marker.validColor
          : this.marker.invalidColor

        this.setPreviewColor(color)
        this.absolutePoints = clone.absolutePoints
        this.active = true
      }

      this.updateHint(e, this.currentPoint)
      this.drawPreview()

      DomEvent.consume(evt)
      e.consume()

    } else if (detector.IS_IE && this.getHandleForEvent(e) != null) {
      // Workaround for disabling the connect highlight when over handle
      e.consume(false)
    }
  }

  /**
   * Hook for subclassers do show details while the handler is active.
   */
  protected updateHint(e: MouseEventEx, point: Point) { }

  /**
   * Hooks for subclassers to hide details when the handler gets inactive.
   */
  protected removeHint() { }

  protected roundLength(length: number) {
    return Math.round(length)
  }

  protected getSnapToTerminalTolerance() {
    return this.graph.gridSize * this.graph.view.scale / 2
  }

  /**
   * Returns the point for the given event.
   */
  protected getPointForEvent(e: MouseEventEx) {
    const view = this.graph.view
    const s = view.scale
    const t = view.translate

    const result = new Point(
      this.roundLength(e.getGraphX() / s) * s,
      this.roundLength(e.getGraphY() / s) * s,
    )

    let overrideX = false
    let overrideY = false
    const tt = this.getSnapToTerminalTolerance()
    if (tt > 0 && this.isSnapToTerminalsEvent(e)) {
      const snapToPoint = (pt: Point) => {
        if (pt != null) {
          const x = pt.x

          if (Math.abs(result.x - x) < tt) {
            result.x = x
            overrideX = true
          }

          const y = pt.y

          if (Math.abs(result.y - y) < tt) {
            result.y = y
            overrideY = true
          }
        }
      }

      // Temporary function
      const snapToTerminal = (terminal: State | null) => {
        if (terminal != null) {
          snapToPoint(
            new Point(
              view.getRoutingCenterX(terminal),
              view.getRoutingCenterY(terminal),
            ))
        }
      }

      snapToTerminal(this.state.getVisibleTerminalState(true))
      snapToTerminal(this.state.getVisibleTerminalState(false))

      if (this.state.absolutePoints != null) {
        this.state.absolutePoints.forEach(p => snapToPoint(p))
      }
    }

    if (this.graph.isGridEnabledForEvent(e.getEvent())) {
      if (!overrideX) {
        result.x = (this.graph.snap(result.x / s - t.x) + t.x) * s
      }
      if (!overrideY) {
        result.y = (this.graph.snap(result.y / s - t.y) + t.y) * s
      }
    }

    return result
  }

  /**
   * Updates the given preview state taking into account
   * the state of the constraint handler.
   */
  protected getPreviewPoints(p: Point, e: MouseEventEx) {
    const point = p.clone()
    const index = this.index!
    const geo = this.graph.getCellGeometry(this.state.cell)!
    let points = (geo.points != null) ? geo.points.slice() : null
    let result = null

    if (!this.isSourceHandle && !this.isTargetHandle) {
      this.convertPoint(point, false)

      if (points == null) {
        points = [point]
      } else {
        // Adds point from virtual bend
        if (DomEvent.isVisualHandle(index)) {
          points.splice(DomEvent.getVisualHandle(index), 0, point)
        }

        if (!this.isSourceHandle && !this.isTargetHandle) {
          if (this.handles != null) {
            for (let i = 0, ii = this.handles.length; i < ii; i += 1) {
              if (i !== index) {
                const handle = this.handles[i]
                // Removes point if dragged on terminal point
                if (handle != null && handle.bounds.containsPoint(p)) {

                  if (DomEvent.isVisualHandle(index)) {
                    points.splice(DomEvent.getVisualHandle(index), 1)
                  } else {
                    points.splice(index - 1, 1)
                  }

                  result = points
                }
              }
            }
          }

          // Removes point if user tries to straighten a segment
          if (
            result == null &&
            this.straightRemoveEnabled &&
            (e == null || !DomEvent.isAltDown(e.getEvent()))
          ) {
            const tol = this.graph.tolerance * this.graph.tolerance
            const abs = this.state.absolutePoints.slice()
            abs[index] = p

            // Handes special case where removing waypoint affects tolerance (flickering)
            const src = this.state.getVisibleTerminalState(true)
            if (src != null) {
              const c = this.graph.getConnectionConstraint(this.state, src, true)
              // Checks if point is not fixed
              if (c == null || this.graph.view.getConnectionPoint(src, c) == null) {
                abs[0] = new Point(
                  src.view.getRoutingCenterX(src),
                  src.view.getRoutingCenterY(src),
                )
              }
            }

            const trg = this.state.getVisibleTerminalState(false)
            if (trg != null) {
              const c = this.graph.getConnectionConstraint(this.state, trg, false)
              // Checks if point is not fixed
              if (c == null || this.graph.view.getConnectionPoint(trg, c) == null) {
                abs[abs.length - 1] = new Point(
                  trg.view.getRoutingCenterX(trg),
                  trg.view.getRoutingCenterY(trg),
                )
              }
            }

            const checkRemove = (idx: number, p: Point) => {
              if (idx > 0 && idx < abs.length - 1 &&
                util.ptSegmentDist(
                  abs[idx - 1].x, abs[idx - 1].y,
                  abs[idx + 1].x, abs[idx + 1].y,
                  p.x, p.y,
                ) < tol
              ) {
                points!.splice(idx - 1, 1)
                result = points
              }
            }

            // LATER: Check if other points can be removed if a segment is made straight
            checkRemove(index, p)
          }
        }

        // Updates existing point
        if (result == null && !DomEvent.isVisualHandle(index)) {
          points[index - 1] = point
        }
      }
    } else if (this.graph.resetEdgesOnConnect) {
      points = null
    }

    return result != null ? result : points
  }

  /**
   * Updates the given preview state taking into account
   * the state of the constraint handler.
   */
  protected getPreviewTerminalState(e: MouseEventEx) {
    this.constraintHandler.update(
      e,
      this.isSourceHandle,
      true,
      e.isSource(this.marker.highlight.shape)
        ? null
        : this.currentPoint,
    )

    if (
      this.constraintHandler.currentState != null &&
      this.constraintHandler.currentConstraint != null
    ) {
      if (
        this.marker.highlight != null &&
        this.marker.highlight.state != null &&
        this.marker.highlight.state.cell ===
        this.constraintHandler.currentState.cell
      ) {
        // Direct repaint needed if cell already highlighted
        if (this.marker.highlight.shape!.stroke !== 'transparent') {
          this.marker.highlight.shape!.stroke = 'transparent'
          this.marker.highlight.repaint()
        }
      } else {
        this.marker.markCell(
          this.constraintHandler.currentState.cell,
          'transparent',
        )
      }

      const model = this.graph.getModel()
      const other = this.graph.view.getTerminalPortState(
        this.state,
        this.graph.view.getState(
          model.getTerminal(this.state.cell, !this.isSourceHandle),
        )!,
        !this.isSourceHandle,
      )
      const otherCell = (other != null) ? other.cell : null

      const source = this.isSourceHandle
        ? this.constraintHandler.currentState.cell
        : otherCell

      const target = this.isSourceHandle
        ? otherCell
        : this.constraintHandler.currentState.cell

      // Updates the error message of the handler
      this.error = this.validateConnection(source, target)
      let result = null

      if (this.error == null) {
        result = this.constraintHandler.currentState
      } else {
        this.constraintHandler.reset()
      }

      return result
    }

    if (!this.graph.isConnectionIgnored(e.getEvent())) {
      this.marker.process(e)
      const state = this.marker.getValidState()

      if (state != null && this.graph.isCellLocked(state.cell)) {
        this.marker.reset()
      }

      return this.marker.getValidState()
    }

    this.marker.reset()

    return null
  }

  protected isOutlineConnectEvent(e: MouseEventEx) {
    const evt = e.getEvent()
    const state = e.getState()

    if (this.outlineConnect && !DomEvent.isShiftDown(evt)) {
      if (
        e.isSource(this.marker.highlight.shape) ||
        (DomEvent.isAltDown(evt) && state != null)
      ) {
        return true
      }

      const clientX = DomEvent.getClientX(evt)
      const clientY = DomEvent.getClientY(evt)
      if (this.marker.highlight.isHighlightAt(clientX, clientY)) {
        return true
      }

      const offset = util.getOffset(this.graph.container)
      const doc = document.documentElement
      const left = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0)
      const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)
      const p = this.currentPoint!

      const gridX = p.x - this.graph.container.scrollLeft + offset.x - left
      const gridY = p.y - this.graph.container.scrollTop + offset.y - top

      if (
        state == null &&
        (gridX !== clientX || gridY !== clientY) &&
        this.marker.highlight.isHighlightAt(gridX, gridY)
      ) {
        return true
      }
    }

    return false
  }

  protected clonePreviewState(point: Point, terminal: Cell | null) {
    return this.state.clone()
  }

  protected updatePreviewState(
    edge: State,
    point: Point,
    terminalState: State | null,
    e: MouseEventEx,
    outline: boolean,
  ) {
    // Computes the points for the edge style and terminals
    const sourceState = this.isSourceHandle
      ? terminalState
      : this.state.getVisibleTerminalState(true)

    const targetState = this.isTargetHandle
      ? terminalState
      : this.state.getVisibleTerminalState(false)

    let sourceC = this.graph.getConnectionConstraint(edge, sourceState, true)
    let targetC = this.graph.getConnectionConstraint(edge, targetState, false)
    let constraint = this.constraintHandler.currentConstraint

    if (constraint == null && outline) {
      if (terminalState != null) {
        // Handles special case where mouse is on outline away from actual end point
        // in which case the grid is ignored and mouse point is used instead
        if (e.isSource(this.marker.highlight.shape)) {
          // tslint:disable-next-line
          point = new Point(e.getGraphX(), e.getGraphY())
        }

        constraint = this.graph.cellManager.getOutlineConstraint(
          point, terminalState, e,
        )
        this.constraintHandler.focus(e, terminalState, this.isSourceHandle)
        this.constraintHandler.currentConstraint = constraint
        this.constraintHandler.currentPoint = point
      } else {
        constraint = new Constraint()
      }
    }

    if (this.outlineConnect &&
      this.marker.highlight != null &&
      this.marker.highlight.shape != null
    ) {
      const s = this.graph.view.scale

      if (
        this.constraintHandler.currentConstraint != null &&
        this.constraintHandler.currentState != null
      ) {
        this.marker.highlight.shape.stroke = (outline)
          ? constants.OUTLINE_HIGHLIGHT_COLOR
          : 'transparent'
        this.marker.highlight.shape.strokeWidth = constants.OUTLINE_HIGHLIGHT_STROKEWIDTH / s / s
        this.marker.highlight.repaint()
      } else if (this.marker.hasValidState()) {
        this.marker.highlight.shape.stroke = (this.marker.getValidState() === e.getState())
          ? constants.DEFAULT_VALID_COLOR
          : 'transparent'
        this.marker.highlight.shape.strokeWidth = constants.HIGHLIGHT_STROKEWIDTH / s / s
        this.marker.highlight.repaint()
      }
    }

    if (this.isSourceHandle) {
      sourceC = constraint!
    } else if (this.isTargetHandle) {
      targetC = constraint!
    }

    if (this.isSourceHandle || this.isTargetHandle) {
      if (constraint != null && constraint.point != null) {
        if (this.isSourceHandle) {
          edge.style.exitX = constraint.point.x
          edge.style.exitY = constraint.point.y
        } else {
          edge.style.entryX = constraint.point.x
          edge.style.entryY = constraint.point.y
        }
      } else {
        if (this.isSourceHandle) {
          delete edge.style.exitX
          delete edge.style.exitY
        } else {
          delete edge.style.entryX
          delete edge.style.entryY
        }
      }
    }

    edge.setVisibleTerminalState(sourceState, true)
    edge.setVisibleTerminalState(targetState, false)

    if (!this.isSourceHandle || sourceState != null) {
      edge.view.updateFixedTerminalPoint(edge, sourceState!, true, sourceC)
    }

    if (!this.isTargetHandle || targetState != null) {
      edge.view.updateFixedTerminalPoint(edge, targetState!, false, targetC)
    }

    if ((this.isSourceHandle || this.isTargetHandle) && terminalState == null) {
      edge.setAbsoluteTerminalPoint(point, this.isSourceHandle)
      if (this.marker.getMarkedState() == null) {
        this.error = (this.graph.allowDanglingEdges) ? null : ''
      }
    }

    edge.view.updateRouterPoints(edge, this.points || [], sourceState!, targetState!)
    edge.view.updateFloatingTerminalPoints(edge, sourceState!, targetState!)
  }

  mouseUp(e: MouseEventEx) {
    if (this.index != null && this.marker != null) {
      const index = this.index
      let edge = this.state.cell

      this.index = null

      // Ignores event if mouse has not been moved
      if (e.getClientX() !== this.startX || e.getClientY() !== this.startY) {
        const clone = (
          !this.graph.isConnectionIgnored(e.getEvent()) &&
          this.graph.isCloneEvent(e.getEvent()) &&
          this.cloneable &&
          this.graph.isCellsCloneable()
        )

        // Displays the reason for not carriying out the change
        // if there is an error message with non-zero length
        if (this.error != null) {
          if (this.error.length > 0) {
            this.graph.validationWarn(this.error)
          }
        } else if (DomEvent.isCustomHandle(index)) {
          if (this.customHandles != null) {
            this.graph.batchUpdate(() => {
              this.customHandles![DomEvent.getCustomHandle(index)].execute()
            })
          }

        } else if (this.isLabelHandle) {

          this.moveLabel(this.state, this.labelPos!.x, this.labelPos!.y)

        } else if (this.isSourceHandle || this.isTargetHandle) {

          let terminal: Cell | null = null

          if (
            this.constraintHandler.currentConstraint != null &&
            this.constraintHandler.currentState != null
          ) {
            terminal = this.constraintHandler.currentState.cell
          }

          if (
            terminal == null &&
            this.marker.hasValidState() &&
            this.marker.highlight != null &&
            this.marker.highlight.shape != null &&
            this.marker.highlight.shape.stroke !== 'transparent' &&
            this.marker.highlight.shape.stroke !== 'white'
          ) {
            terminal = this.marker.validState!.cell
          }

          if (terminal != null) {
            const model = this.graph.getModel()
            const parent = model.getParent(edge)

            this.graph.batchUpdate(() => {
              // Clones and adds the cell
              if (clone) {
                let geo = model.getGeometry(edge)
                const clone = this.graph.cloneCell(edge)
                model.add(parent, clone, model.getChildCount(parent))

                if (geo != null) {
                  geo = geo.clone()
                  model.setGeometry(clone, geo)
                }

                const other = model.getTerminal(edge, !this.isSourceHandle)!
                this.graph.connectCell(clone, other, !this.isSourceHandle)

                edge = clone
              }

              edge = this.connect(edge, terminal!, this.isSourceHandle, clone, e)
            })

          } else if (this.graph.isDanglingEdgesEnabled()) {

            const s = this.graph.view.scale
            const t = this.graph.view.translate
            const i = this.isSourceHandle ? 0 : this.absolutePoints.length - 1
            const p = this.absolutePoints[i]

            p.x = this.roundLength(p.x / s - t.x)
            p.y = this.roundLength(p.y / s - t.y)

            const pstate = this.graph.view.getState(
              this.graph.getModel().getParent(edge),
            )

            if (pstate != null) {
              p.x -= pstate.origin.x
              p.y -= pstate.origin.y
            }

            p.x -= this.graph.tx / s
            p.y -= this.graph.ty / s

            // Destroys and recreates this handler
            edge = this.changeTerminalPoint(edge, p, this.isSourceHandle, clone)
          }
        } else if (this.active) {
          edge = this.changePoints(edge, this.points || [], clone)
        } else {
          this.graph.view.invalidate(this.state.cell)
          this.graph.view.validate(this.state.cell)
        }
      }

      // Resets the preview color the state of the handler if this
      // handler has not been recreated
      if (this.marker != null) {
        this.reset()

        // Updates the selection if the edge has been cloned
        if (edge !== this.state.cell) {
          this.graph.setSelectedCell(edge)
        }
      }

      e.consume()
    }
  }

  /**
   * Resets the state of this handler.
   */
  protected reset() {
    if (this.active) {
      this.refresh()
    }

    this.error = null
    this.index = null
    this.labelPos = null
    this.points = null
    this.snapPoint = null
    this.isLabelHandle = false
    this.isSourceHandle = false
    this.isTargetHandle = false
    this.active = false

    if (this.marker != null) {
      this.marker.reset()
    }

    if (this.constraintHandler != null) {
      this.constraintHandler.reset()
    }

    if (this.customHandles != null) {
      for (let i = 0, ii = this.customHandles.length; i < ii; i += 1) {
        this.customHandles[i].reset()
      }
    }

    this.removeHint()
    this.redraw()
  }

  /**
   * Sets the color of the preview to the given value.
   */
  protected setPreviewColor(color: string | null) {
    if (this.previewShape != null) {
      this.previewShape.stroke = color
    }
  }

  /**
   * Converts the given point in-place from screen to unscaled, untranslated
   * graph coordinates and applies the grid. Returns the given, modified
   * point instance.
   */
  protected convertPoint(point: Point, gridEnabled: boolean) {
    const s = this.graph.view.getScale()
    const t = this.graph.view.getTranslate()

    if (gridEnabled) {
      point.x = this.graph.snap(point.x)
      point.y = this.graph.snap(point.y)
    }

    point.x = Math.round(point.x / s - t.x)
    point.y = Math.round(point.y / s - t.y)

    const pstate = this.graph.view.getState(
      this.graph.getModel().getParent(this.state.cell),
    )

    if (pstate != null) {
      point.x -= pstate.origin.x
      point.y -= pstate.origin.y
    }

    return point
  }

  /**
   * Changes the coordinates for the label of the given edge.
   */
  protected moveLabel(edgeState: State, x: number, y: number) {
    const model = this.graph.getModel()
    const scale = this.graph.view.scale
    let geo = model.getGeometry(edgeState.cell)
    if (geo != null) {
      geo = geo.clone()

      if (geo.relative) {

        // Resets the relative location stored inside the geometry
        let pt = this.graph.view.getRelativePoint(edgeState, x, y)
        geo.bounds.x = Math.round(pt.x * 10000) / 10000
        geo.bounds.y = Math.round(pt.y)

        // Resets the offset inside the geometry to find the offset
        // from the resulting point
        geo.offset = new Point(0, 0)
        pt = this.graph.view.getPointOnEdge(edgeState, geo)
        geo.offset = new Point(
          Math.round((x - pt.x) / scale),
          Math.round((y - pt.y) / scale),
        )

      } else {

        const points = edgeState.absolutePoints
        const p0 = points[0]
        const pe = points[points.length - 1]

        if (p0 != null && pe != null) {
          const cx = p0.x + (pe.x - p0.x) / 2
          const cy = p0.y + (pe.y - p0.y) / 2

          geo.offset = new Point(
            Math.round((x - cx) / scale),
            Math.round((y - cy) / scale),
          )
          geo.bounds.x = 0
          geo.bounds.y = 0
        }
      }

      model.setGeometry(edgeState.cell, geo)
    }
  }

  protected connect(
    edge: Cell,
    terminal: Cell,
    isSource: boolean,
    clone: boolean,
    e: MouseEventEx,
  ) {
    this.graph.batchUpdate(() => {
      let constraint = this.constraintHandler.currentConstraint
      if (constraint == null) {
        constraint = new Constraint()
      }

      this.graph.connectCell(edge, terminal, isSource, constraint)
    })

    return edge
  }

  /**
   * Changes the terminal point of the given edge.
   */
  protected changeTerminalPoint(
    edge: Cell,
    point: Point,
    isSource: boolean,
    clone: boolean,
  ) {

    const model = this.graph.getModel()
    this.graph.batchUpdate(() => {
      if (clone) {
        const parent = model.getParent(edge)
        const terminal = model.getTerminal(edge, !isSource)
        edge = this.graph.cloneCell(edge) // tslint:disable-line
        model.add(parent, edge, model.getChildCount(parent))
        model.setTerminal(edge, terminal, !isSource)
      }

      let geo = model.getGeometry(edge)

      if (geo != null) {
        geo = geo.clone()
        geo.setTerminalPoint(point, isSource)
        model.setGeometry(edge, geo)
        this.graph.connectCell(edge, null, isSource, new Constraint())
      }
    })

    return edge
  }

  /**
   * Changes the control points of the given edge in the graph model.
   */
  protected changePoints(edge: Cell, points: Point[], clone: boolean) {
    const model = this.graph.getModel()
    this.graph.batchUpdate(() => {
      if (clone) {
        const parent = model.getParent(edge)
        const source = model.getTerminal(edge, true)
        const target = model.getTerminal(edge, false)
        edge = this.graph.cloneCell(edge) // tslint:disable-line
        model.add(parent, edge, model.getChildCount(parent))
        model.setTerminal(edge, source, true)
        model.setTerminal(edge, target, false)
      }

      let geo = model.getGeometry(edge)

      if (geo != null) {
        geo = geo.clone()
        geo.points = points

        model.setGeometry(edge, geo)
      }
    })

    return edge
  }

  /**
   * Returns the fillcolor for the handle at the given index.
   */
  protected getHandleFillColor(index: number) {
    const isSource = index === 0
    const cell = this.state.cell
    const terminal = this.graph.getModel().getTerminal(cell, isSource)
    let color = constants.HANDLE_FILLCOLOR

    if (
      (terminal != null && !this.graph.isCellDisconnectable(cell, terminal, isSource)) ||
      (terminal == null && !this.graph.isTerminalPointMovable(cell, isSource))
    ) {
      color = constants.LOCKED_HANDLE_FILLCOLOR
    } else if (
      terminal != null &&
      this.graph.isCellDisconnectable(cell, terminal, isSource)
    ) {
      color = constants.CONNECT_HANDLE_FILLCOLOR
    }

    return color
  }

  protected refresh() {
    this.absolutePoints = this.getSelectionPoints(this.state)
    this.points = []

    if (this.previewShape != null) {
      this.previewShape.points = this.absolutePoints
    }

    if (this.handles != null) {
      this.destroyHandles(this.handles)
      this.handles = this.createHandles()
    }

    if (this.virtualHandles != null) {
      this.destroyHandles(this.virtualHandles)
      this.virtualHandles = this.createVirtualHandles()
    }

    if (this.customHandles != null) {
      this.destroyHandles(this.customHandles)
      this.customHandles = this.createCustomHandles()
    }

    // Puts label node on top of bends
    if (this.labelHandleShape) {
      util.toFront(this.labelHandleShape.elem)
    }
  }

  redraw() {
    this.absolutePoints = this.state.absolutePoints.slice()
    this.redrawHandles()

    const geo = this.graph.model.getGeometry(this.state.cell)!
    const pts = geo.points

    if (pts != null && this.handles != null && this.handles.length > 0) {
      if (this.points == null) {
        this.points = []
      }

      for (let i = 1, ii = this.handles.length - 1; i < ii; i += 1) {
        if (this.handles[i] != null && this.absolutePoints[i] != null) {
          this.points[i - 1] = pts[i - 1]
        }
      }
    }

    this.drawPreview()
  }

  protected redrawHandles() {
    const cell = this.state.cell

    if (this.labelHandleShape != null) {
      // Updates the handle for the label position
      const bounds = this.labelHandleShape.bounds
      const offset = getLabelHandleOffset({
        graph: this.graph,
        cell: this.state.cell,
        shape: this.labelHandleShape,
      })

      this.labelPos = this.state.absoluteOffset.clone()
      this.labelHandleShape.bounds = new Rectangle(
        Math.round(this.labelPos.x - bounds.width / 2 + offset.x),
        Math.round(this.labelPos.y - bounds.height / 2 + offset.y),
        bounds.width,
        bounds.height,
      )

      // Shows or hides the label handle depending on the label
      this.labelHandleShape.visible = (
        util.isValidLabel(this.graph.getLabel(cell)) &&
        this.graph.isLabelMovable(cell)
      )
    }

    if (this.handles != null && this.handles.length > 0) {
      const p0 = this.absolutePoints[0]
      const pe = this.absolutePoints[this.absolutePoints.length - 1]

      // first bend
      const handle0 = this.handles[0]
      if (handle0 != null) {
        const x0 = p0.x
        const y0 = p0.y
        const b = handle0.bounds
        handle0.bounds = new Rectangle(
          Math.floor(x0 - b.width / 2),
          Math.floor(y0 - b.height / 2),
          b.width,
          b.height,
        )
        handle0.redraw()

        if (this.manageLabelHandle) {
          this.checkLabelHandle(handle0.bounds)
        }
      }

      // last bend
      const handle = this.handles[this.handles.length - 1]
      if (handle != null) {
        const xn = pe.x
        const yn = pe.y

        const b = handle.bounds
        handle.bounds = new Rectangle(
          Math.floor(xn - b.width / 2),
          Math.floor(yn - b.height / 2),
          b.width,
          b.height,
        )
        handle.redraw()

        if (this.manageLabelHandle) {
          this.checkLabelHandle(handle.bounds)
        }
      }

      this.redrawInnerHandles(p0, pe)
    }

    if (
      this.absolutePoints != null &&
      this.virtualHandles != null &&
      this.virtualHandles.length > 0
    ) {
      let pl = this.absolutePoints[0]
      for (let i = 0, ii = this.virtualHandles.length; i < ii; i += 1) {
        const point = this.absolutePoints[i + 1]
        const handle = this.virtualHandles[i]
        if (handle != null && point != null) {
          const x = pl.x + (point.x - pl.x) / 2
          const y = pl.y + (point.y - pl.y) / 2

          handle.bounds = new Rectangle(
            Math.floor(x - handle.bounds.width / 2),
            Math.floor(y - handle.bounds.height / 2),
            handle.bounds.width,
            handle.bounds.height,
          )
          handle.redraw()
          pl = point

          if (this.manageLabelHandle) {
            this.checkLabelHandle(handle.bounds)
          }
        }
      }
    }

    if (this.labelHandleShape != null) {
      this.labelHandleShape.redraw()
    }

    if (this.customHandles != null) {
      this.customHandles.forEach(c => c.redraw())
    }
  }

  protected drawPreview() {
    if (this.isLabelHandle) {
      if (this.labelHandleShape != null) {
        const b = this.labelHandleShape.bounds
        const bounds = new Rectangle(
          Math.round(this.labelPos!.x - b.width / 2),
          Math.round(this.labelPos!.y - b.height / 2),
          b.width,
          b.height,
        )
        this.labelHandleShape.bounds = bounds
        this.labelHandleShape.redraw()
      }
    } else if (this.previewShape != null) {
      this.previewShape.apply(this.state)
      this.previewShape.points = this.absolutePoints
      this.previewShape.scale = this.state.view.scale
      this.previewShape.shadow = false

      const args = {
        graph: this.graph,
        cell: this.state.cell,
        shape: this.previewShape,
      }

      applySelectionPreviewStyle(args)
      this.previewShape.outline = true
      this.previewShape.shadow = false
      this.previewShape.cursor = getSelectionPreviewCursor(args)

      this.previewShape.redraw()
    }

    if (this.parentHighlight != null) {
      this.parentHighlight.redraw()
    }
  }

  /**
   * Checks if the label handle intersects the given bounds and moves
   * it if it intersects.
   */
  protected checkLabelHandle(b: Rectangle) {
    if (this.labelHandleShape != null) {
      const b2 = this.labelHandleShape.bounds
      if (b.isIntersectWith(b2)) {
        if (b.getCenterY() < b2.getCenterY()) {
          b2.y = b.y + b.height
        } else {
          b2.y = b.y - b2.height
        }
      }
    }
  }

  protected redrawInnerHandles(p0: Point, pe: Point) {
    if (this.handles) {
      for (let i = 1, ii = this.handles.length - 1; i < ii; i += 1) {
        const handle = this.handles[i]
        if (handle != null) {
          if (this.absolutePoints[i] != null) {
            const x = this.absolutePoints[i].x
            const y = this.absolutePoints[i].y
            const b = handle.bounds

            handle.elem!.style.visibility = ''
            handle.bounds = new Rectangle(
              Math.round(x - b.width / 2),
              Math.round(y - b.height / 2),
              b.width,
              b.height,
            )

            if (this.manageLabelHandle) {
              this.checkLabelHandle(handle.bounds)
            } else if (
              this.labelHandleShape != null &&
              this.labelHandleShape.visible &&
              handle.bounds.isIntersectWith(this.labelHandleShape.bounds)
            ) {
              const w = b.width + 3
              const h = b.height + 3
              handle.bounds = new Rectangle(
                Math.round(x - w / 2),
                Math.round(y - h / 2),
                w,
                h,
              )
            }

            handle.redraw()
          } else {
            handle.dispose();
            (this.handles as any)[i] = null
          }
        }
      }
    }
  }

  protected setHandlesVisible(visible: boolean) {
    this.handles && this.handles.forEach((bend) => {
      if (bend && bend.elem) {
        bend.elem!.style.display = visible ? '' : 'none'
      }
    })

    this.virtualHandles && this.virtualHandles.forEach((bend) => {
      if (bend && bend.elem) {
        bend.elem!.style.display = visible ? '' : 'none'
      }
    })

    if (this.labelHandleShape != null) {
      this.labelHandleShape.elem!.style.display = visible ? '' : 'none'
    }

    if (this.customHandles != null) {
      this.customHandles.forEach(c => c.setVisible(visible))
    }
  }

  protected destroyHandles(
    handles: (IDisposable | Handle | null)[] | null,
  ) {
    handles && handles.forEach(h => (h && h.dispose()))
  }

  @Disposable.aop()
  dispose() {
    this.state.view.graph.off(Graph.events.escape, this.escapeHandler)
    this.escapeHandler = null

    this.marker.dispose()
    this.constraintHandler.dispose()

    if (this.previewShape != null) {
      this.previewShape.dispose()
      this.previewShape = null
    }

    if (this.parentHighlight != null) {
      this.parentHighlight.dispose()
      this.parentHighlight = null
    }

    if (this.labelHandleShape != null) {
      this.labelHandleShape.dispose()
      this.labelHandleShape = null
    }

    this.destroyHandles(this.virtualHandles)
    this.virtualHandles = null

    this.destroyHandles(this.customHandles)
    this.customHandles = null

    this.destroyHandles(this.handles)
    this.handles = null

    this.removeHint()
  }
}

export namespace EdgeHandler {
  export class EdgeHandlerMarker extends CellMarker {
    edgeHandler: EdgeHandler

    constructor(graph: Graph, edgeHandler: EdgeHandler) {
      const options = getConnectionHighlightOptions({
        graph,
        cell: edgeHandler.state.cell,
      })
      super(graph, options)
      this.edgeHandler = edgeHandler
    }

    get state() {
      return this.edgeHandler.state
    }

    get currentPoint() {
      return this.edgeHandler.currentPoint
    }

    get isSource() {
      return this.edgeHandler.isSourceHandle
    }

    getCell(e: MouseEventEx) {
      const model = this.graph.getModel()
      let cell = super.getCell(e)

      // Checks for cell at preview point (with grid)
      if (
        (cell === this.state.cell || cell == null) &&
        this.currentPoint != null
      ) {
        cell = this.graph.getCellAt(this.currentPoint.x, this.currentPoint.y)
      }

      // Uses connectable parent node if one exists
      if (cell != null && !this.graph.isCellConnectable(cell)) {
        const parent = model.getParent(cell)
        if (model.isNode(parent) && this.graph.isCellConnectable(parent)) {
          cell = parent
        }
      }

      if (
        (
          this.graph.isSwimlane(cell) &&
          this.currentPoint != null &&
          this.graph.cellManager.hitsSwimlaneContent(
            cell, this.currentPoint.x, this.currentPoint.y,
          )
        )
        ||
        !this.edgeHandler.isConnectableCell(cell)
        ||
        (
          cell === this.state.cell ||
          (cell != null && !this.graph.edgesConnectable && model.isEdge(cell))
        )
        ||
        model.isAncestor(this.state.cell, cell)
      ) {
        cell = null
      }

      if (!this.graph.isCellConnectable(cell)) {
        cell = null
      }

      return cell
    }

    // Sets the highlight color according to validateConnection
    isValidState(state: State) {
      const model = this.graph.getModel()
      const other = this.graph.view.getTerminalPortState(
        state, this.graph.view.getState(
          model.getTerminal(this.state.cell, !this.isSource),
        )!,
        !this.isSource,
      )
      const otherCell = (other != null) ? other.cell : null
      const source = (this.isSource) ? state.cell : otherCell
      const target = (this.isSource) ? otherCell : state.cell

      // Updates the error message of the handler
      this.edgeHandler.error =
        this.edgeHandler.validateConnection(source, target)

      return this.edgeHandler.error == null
    }
  }
}