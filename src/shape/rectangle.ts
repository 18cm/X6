import { constants } from '../common'
import { Rectangle } from '../struct'
import { SvgCanvas2D } from '../canvas'
import { Shape } from './shape'

export class RectangleShape extends Shape {
  constructor(
    bounds: Rectangle,
    fill?: string | null,
    stroke?: string | null,
    strokewidth?: number | null,
  ) {
    super()
    this.bounds = bounds
    this.fill = fill != null ? fill : null
    this.stroke = stroke != null ? stroke : null
    this.strokeWidth = strokewidth != null ? strokewidth : 1
  }

  protected isRoundable() {
    return true
  }

  paintBackground(
    c: SvgCanvas2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const events = this.style.pointerEvents !== false

    if (
      events ||
      (this.fill != null && this.fill !== constants.NONE) ||
      (this.stroke != null && this.stroke !== constants.NONE)
    ) {
      if (!events && (this.fill == null || this.fill === constants.NONE)) {
        c.pointerEvents = false
      }

      if (this.rounded) {
        const r = this.getArcSize(w, h)
        c.roundRect(x, y, w, h, r, r)
      } else {
        c.rect(x, y, w, h)
      }

      c.fillAndStroke()
    }
  }

  paintForeground(
    c: SvgCanvas2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (
      this.glass &&
      !this.outline &&
      this.fill != null &&
      this.fill !== constants.NONE
    ) {
      this.paintGlassEffect(c, x, y, w, h, this.getArcSize(
        w + (this.strokeWidth as number),
        h + (this.strokeWidth as number),
      ))
    }
  }
}