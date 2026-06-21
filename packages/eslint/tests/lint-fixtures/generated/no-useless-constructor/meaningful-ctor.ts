// fixture: no-useless-constructor should NOT fire
export class Foo {
  private x: number
  constructor(x: number) {
    this.x = x
  }
}
