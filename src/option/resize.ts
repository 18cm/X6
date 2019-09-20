import { Graph, Cell } from '../core'
import { Shape, ImageShape } from '../shape'
import { Rectangle } from '../struct'
import { MouseEventEx } from '../common'
import { HandleOptions, createHandleShape } from './handle'
import {
  BaseStyle,
  OptionItem,
  drill,
  applyBaseStyle,
  applyClassName,
  applyManualStyle,
} from './util'

export interface ResizeOption {
  /**
   * Specifies if the graph should allow resizing of cells.
   *
   * Default is `true`.
   */
  enabled: boolean

  /**
   * Specifies if the center of the node should be maintained during resizing.
   *
   * Default is `false`.
   */
  centered: boolean | ((this: Graph, cell: Cell, e: MouseEventEx) => boolean)

  /**
   * Specifies if resize handle should be hidden and spaced if the node
   * is too small.
   *
   * Default is `false`.
   */
  manageHandles: boolean

  livePreview: boolean
}

export interface ResizeHandleOptions extends
  BaseStyle<ApplyResizeHandleStyleArgs>,
  HandleOptions<CreateResizeHandleShapeArgs, ApplyResizeHandleStyleArgs> {
  /**
   * Specifies if only one sizer handle at the bottom, right corner should be
   * used.
   *
   * Default is `false`.
   */
  single: boolean

  visible: OptionItem<IsResizeHandleVisibleArgs, boolean>
}

export interface CreateResizeHandleShapeArgs {
  graph: Graph
  cell: Cell
  index: number
  cursor: string
}

export interface ApplyResizeHandleStyleArgs
  extends CreateResizeHandleShapeArgs {
  shape: Shape
}

export function createResizeHandle(args: CreateResizeHandleShapeArgs) {
  const { graph, cursor } = args
  const options = graph.options.resizeHandle as ResizeHandleOptions
  const shape = createHandleShape(args, options)
  const newArgs = { ...args, shape }

  if (!(shape instanceof ImageShape)) {
    const size = drill(options.size, graph, newArgs)
    const bounds = new Rectangle(0, 0, size, size)

    shape.bounds = bounds
    applyBaseStyle(newArgs, options)
  }

  applyClassName(newArgs, options, cursor)
  applyManualStyle(newArgs, options)

  return shape
}

export interface ResizePreviewOptions
  extends BaseStyle<ApplyResizePreviewStyleArgs> { }

export interface ApplyResizePreviewStyleArgs {
  graph: Graph
  cell: Cell
  shape: Shape
}

export function applyResizePreviewStyle(args: ApplyResizePreviewStyleArgs) {
  const options = args.graph.options.resizePreview as ResizePreviewOptions
  applyBaseStyle(args, options)
  applyClassName(args, options, 'resize-preview')
  applyManualStyle(args, options)
  return args.shape
}

export interface IsResizeHandleVisibleArgs {
  graph: Graph
  cell: Cell
  index: number
}

export function isResizeHandleVisible(args: IsResizeHandleVisibleArgs) {
  const { graph } = args
  const options = graph.options.resizeHandle as ResizeHandleOptions
  return drill(options.visible, graph, args)
}