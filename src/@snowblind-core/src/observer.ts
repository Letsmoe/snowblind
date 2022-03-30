import RenderAssignment from "./render-assignment.js";

const isProxy = Symbol("");

class Observer {
	public _value: any;
	boundRender: RenderAssignment;
	debounce: any;
	/**
	 * Instantiates a proxy based on a passed object supporting rerendering of components.
	 * @param value The object a proxy should be attached to.
	 */
	constructor(value: object, callback : Function = () => {}) {
		const _Handler = {
			get(target : object, key : any) {
				if (key === isProxy) return true;

				const prop = target[key];
				if (typeof prop == 'undefined') {
					return
				}

				// set value as proxy if object
				if (prop !== null) {
					var constructor = prop.constructor;
					if (!prop[isProxy] && constructor && ((constructor === ({}).constructor) || (constructor === ([]).constructor))) {
						target[key] = new Proxy(prop, _Handler);
					}
				}

				return target[key];
			},
			set: (x : object, y : any, z : any) => {
				x[y] = z;
				if (this.boundRender) {
					if (this.debounce) {
						window.cancelAnimationFrame(this.debounce);
					}
					this.debounce = window.requestAnimationFrame(() => {
						this.boundRender.Render()
					})
				}
				callback(x, y, z);
				return true
			}
		}
		this._value = new Proxy(value, _Handler);
	}
}

export {
	Observer
}