import { Object3D } from "three"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      primitive: {
        ref?: React.Ref<any>
        object: Object3D | any
        attach?: string
        [key: string]: any
      }
    }
  }
}

export {}
