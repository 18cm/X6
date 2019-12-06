import * as util from '../util'
import { Graph } from './graph'

export function hook(
  hookName?: string | null,
  ignoreNullResult: boolean = false,
) {
  return (
    target: Graph,
    methodName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const raw = descriptor.value
    const name = hookName || methodName

    descriptor.value = function(this: Graph, ...args: any[]) {
      const hook = (this.options as any)[name]
      if (hook != null) {
        this.getNativeValue = raw.bind(this, ...args)
        const ret = util.call(hook, this, ...args)
        delete this.getNativeValue

        if (ret != null || ignoreNullResult) {
          return ret
        }
      }

      return raw.call(this, ...args)
    }
  }
}

export function afterCreate(aopName?: string | null) {
  return (
    target: Graph,
    methodName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const raw = descriptor.value
    const name = aopName || `on${util.ucFirst(methodName)}`

    descriptor.value = function(this: Graph, ...args: any[]) {
      const instance = raw.call(this, ...args)
      const aop = (this.options as any)[name]
      if (aop != null) {
        args.unshift(instance)
        return util.apply(aop, this, args)
      }

      return instance
    }
  }
}