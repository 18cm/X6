import { Point, Rectangle, Image } from '.'
import { State } from '../core/state'
import { Events } from '../common'
import { Align, VAlign } from '../types'

export class Overlay extends Events {
  image: Image
  tooltip: string
  align: Align
  verticalAlign: VAlign
  offset: Point
  cursor: string

  /**
   * Defines the overlapping for the overlay, that is, the proportional
   * distance from the origin to the point defined by the alignment.
   *
   * Default is `0.5`.
   */
  defaultOverlap: number = 0.5

  constructor(
    image: Image,
    tooltip: string,
    align?: Align,
    verticalAlign?: VAlign,
    offset?: Point,
    cursor?: string,
  ) {
    super()

    this.image = image
    this.tooltip = tooltip
    this.align = (align != null) ? align : this.align
    this.verticalAlign = (verticalAlign != null) ? verticalAlign : this.verticalAlign
    this.offset = (offset != null) ? offset : new Point()
    this.cursor = (cursor != null) ? cursor : 'help'
  }

  getBounds(state: State) {
    const isEdge = state.cell.isEdge()
    const s = state.view.scale
    let pt = null

    const w = this.image.width
    const h = this.image.height

    if (isEdge) {
      const pts = state.absolutePoints
      if (pts.length % 2 === 1) {
        pt = pts[Math.floor(pts.length / 2)]
      } else {
        const idx = pts.length / 2
        const p0 = pts[idx - 1]!
        const p1 = pts[idx]!
        pt = new Point(
          p0.x + (p1.x - p0.x) / 2,
          p0.y + (p1.y - p0.y) / 2,
        )
      }
    } else {
      pt = new Point()

      if (this.align === 'left') {
        pt.x = state.bounds.x
      } else if (this.align === 'center') {
        pt.x = state.bounds.x + state.bounds.width / 2
      } else {
        pt.x = state.bounds.x + state.bounds.width
      }

      if (this.verticalAlign === 'top') {
        pt.y = state.bounds.y
      } else if (this.verticalAlign === 'middle') {
        pt.y = state.bounds.y + state.bounds.height / 2
      } else {
        pt.y = state.bounds.y + state.bounds.height
      }
    }

    return new Rectangle(
      Math.round(pt!.x - (w * this.defaultOverlap - this.offset.x) * s),
      Math.round(pt!.y - (h * this.defaultOverlap - this.offset.y) * s),
      w * s,
      h * s,
    )
  }

  toString() {
    return this.tooltip
  }
}