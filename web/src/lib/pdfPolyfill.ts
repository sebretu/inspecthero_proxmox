if (typeof global.DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(arg?: any) {
      if (typeof arg === 'string') return;
      if (Array.isArray(arg)) {
        this.a = arg[0] || 1; this.b = arg[1] || 0; this.c = arg[2] || 0;
        this.d = arg[3] || 1; this.e = arg[4] || 0; this.f = arg[5] || 0;
      }
    }
  };
}
if (typeof global.Path2D === 'undefined') {
  (global as any).Path2D = class Path2D {};
}
