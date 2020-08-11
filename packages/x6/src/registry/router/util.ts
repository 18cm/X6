import { NumberExt } from '../../util'
import { Point, Rectangle } from '../../geometry'
import { EdgeView } from '../../view/edge'

export interface PaddingOptions {
  padding?: NumberExt.SideOptions
}

export function getPointBBox(p: Point) {
  return new Rectangle(p.x, p.y, 0, 0)
}

export function getPaddingBox(options: PaddingOptions = {}) {
  const sides = NumberExt.normalizeSides(options.padding || 20)

  return {
    x: -sides.left,
    y: -sides.top,
    width: sides.left + sides.right,
    height: sides.top + sides.bottom,
  }
}

export function getSourceBBox(view: EdgeView, options: PaddingOptions = {}) {
  return view.sourceBBox.clone().moveAndExpand(getPaddingBox(options))
}

export function getTargetBBox(view: EdgeView, options: PaddingOptions = {}) {
  return view.targetBBox.clone().moveAndExpand(getPaddingBox(options))
}

export function getSourceEndpoint(
  view: EdgeView,
  options: PaddingOptions = {},
) {
  if (view.sourceEndpoint) {
    return view.sourceEndpoint
  }
  const bbox = getSourceBBox(view, options)
  return bbox.getCenter()
}

export function getTargetEndpoint(
  view: EdgeView,
  options: PaddingOptions = {},
) {
  if (view.targetEndpoint) {
    return view.targetEndpoint
  }

  const bbox = getTargetBBox(view, options)
  return bbox.getCenter()
}