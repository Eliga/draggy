var type = require('mutypes');
var css = require('mucss');
var m = require('mumath');
var state = require('st8');
var parse = require('muparse');
var Emitter = require('emmy');
var Enot = require('enot');
var getEl = require('query-relative');

var win = window,
	doc = document,
	root = doc.documentElement;


/**
 * Draggy mod - makes any element draggable
 *
 * @module draggy
 * @constructor
 *
 * @return {Element} Target element
 */
module.exports = Draggy;



/* ------------------------------------ I N I T -------------------------------------- */


function Draggy(target, options){
	this.element = target;
	this.element.draggy = this;

	options = options || {};

	//parse attributes of targret
	var prop, parseResult;
	for (var propName in Draggy.options){
		//parse attribute, if no option passed
		if (options[propName] === undefined){
			prop = Draggy.options[propName];
			options[propName] = parse.attribute(target, propName, prop && prop.init !== undefined ? prop.init : prop);
		}

		//declare initial value
		if (options[propName] !== undefined) {
			this[propName] = options[propName];
		}
	}


	//holder for params while drag
	this.dragparams = {
		//initial offset from the `within` in 0-position
		initOffsetX: undefined,
		initOffsetY: undefined,

		//click offsets
		innerOffsetX: 0,
		innerOffsetY: 0,

		//dragstert initial client x and y
		initClientX: 0,
		initClientY: 0,

		//previous position on the screen
		prevClientX: 0,
		prevClientY: 0,

		//tracking params
		velocity: 0,
		angle: 0,

		//[clientX, clientY] for the last track
		frame: undefined,
		timestamp: undefined,

		//container absolute offsets
		containerOffsetX: 0,
		containerOffsetY: 0
	};


	//apply params
	state(this, Draggy.options);


	//update limits, if draggy is in the content already
	if (document.contains(this.element)){
		this.updateLimits();
	}
}



/* ---------------------------------- O P T I O N S ---------------------------------- */


Draggy.options = {
	/** Restricting container
	 * @type {Element|object}
	 * @default root
	 */
	within: {
		init: function(init){
			return init;
		},
		set: function(within){
			var res;

			//catch predefined parent reference string
			if (within === undefined) {
				res = this.element.parentNode;
			}
			else if (!within) return within;
			else {
				res = getEl(within, this.element);
			}

			if (res === document) res = root;

			return res;
		}
	},


	/** Which area of draggable should not be outside the restriction area.
	 * False value means center by the self rect
	 * @type {(Array|number|false)}
	 * @default this
	 */
	pin: {
		set: function(value){
			if (type.isArray(value)){
				if (value.length === 2){
					return [value[0], value[1], value[0], value[1]];
				} else if (value.length === 4){
					return value;
				}
			}

			else if (type.isNumber(value)){
				return [value, value, value, value];
			}

			return value;
		},

		get: function(value){
			//return the whole size if no value defined
			if (!value)	return [0,0,this.element.offsetWidth, this.element.offsetHeight];

			return value;
		}
	},


	/** Clone object for dragging */
	ghost: false,


	/** How fast to move when released
	 */
	velocity: 2000,
	maxVelocity: 100,


	/** For how long to release movement
	 *
	 * @type {(number|false)}
	 * @default false
	 * @todo
	 */
	release: false,


	/** Initial drag ignore area
	 *
	 * @type {(Array(4)|Array(2)|Function|number)}
	 */
	threshold: {
		init: 0,

		//return array[x,y,x,y]
		get: function(val){
			if (type.isFn(val)){
				return val();
			} else {
				return val;
			}
		},

		set: function(val){
			if (type.isNumber(val)){
				return [-val*.5, -val*.5, val*.5, val*.5];
			} else if (val.length === 2){
				//Array(w,h)
				return [-val[0]*.5, -val[1]*.5, val[0]*.5, val[1]*.5];
			} else if(val.length === 4){
				//Array(x1,y1,x2,y2)
				return val;
			} else if (type.isFn(val)){
				//custom val funciton
				return val;
			} else {
				return [0,0,0,0];
			}
		}
	},


	/** Autoscroll on reaching the border of the screen */
	autoscroll: false,


	/** To what extent round position */
	precision: 1,


	/** slow down movement by pressing ctrl/cmd */
	sniper: true,


	/** how much is slower sniper drag */
	sniperSpeed: .15,


	/** Restrict movement by axis
	 *
	 * @default undefined
	 * @enum {string}
	 */
	axis: {
		x: {
			//ignore setting y
			y: {
				set: function(){
					return 0;
				}
			}
			// threshold: {
			// 	get: function(val){
			// 		val = Draggable.fn.threshold.get(val);
			// 		val[1] = -9999;
			// 		val[3] = 9999;
			// 		return val;
			// 	}
			// }
		},
		y: {
			x: {
				//ignore setting x
				set: function(){
					return 0;
				}
			}
			// threshold: {
			// 	get: function(val){
			// 		val = Draggable.fn.threshold.get(val);
			// 		val[0] = -9999;
			// 		val[2] = 9999;
			// 		return val;
			// 	}
			// }
		},
		_: {

		}
	},


	/** Repeat position by one of axis
	 * @enum {string}
	 * @default undefined
	 */
	repeat: {
		undefined: null,
		both: null,
		x: null,
		y: null,
		_: function(){
			//TODO
			//vector passed
			if (this.repeat instanceof Array){
				if (this.repeat.length){
					if (this.repeat[0] && this.repeat[1])
						return "both";
					else if (this.repeat[0])
						return "x";
					else if (this.repeat[1])
						return "y";
				}

			//just repeat any possible way
			} else if (this.repeat === true){
				return this.axis

			//unrecognized value passed
			} else {
				return undefined;
			}
		}
	},


	/** Hide cursor on drag (reduce clutter) */
	hideCursor: false,

	/**
	 * Position
	 */
	x: {
		init: 0,
		set: function(value){
			var limits = this.limits;
			value = m.between(value, limits.left, limits.right);
			//snap to pixels
			return Math.round(value);
		},
		changed: function(value, old){
			if (this.freeze) return;
			css(this.element,
				'transform',
				['translate3d(', value, 'px,', this.y, 'px, 0)'].join(''));
		}
	},
	y: {
		init: 0,
		set: function(value){
			var limits = this.limits;
			value = m.between(value, limits.top, limits.bottom);
			//snap to pixels
			return Math.round(value);
		},
		changed: function(value){
			if (this.freeze) return;
			css(this.element,
				'transform',
				['translate3d(', this.x, 'px,', value, 'px, 0)'].join(''));
		}
	},


	/** Ignore position change */
	freeze: false,


	/**
	 * Limits representing current drag area
	 *
	 * @type {Object}
	 * @todo  make it work
	 */
	limits: {
		init: function(){
			return {top:-9999, bottom:9999, left: -9999, right:9999};
		}
	},


	/**
	* State of drag.
	* @enum {string}
	* @default is 'idle'
	*/
	dragstate: {
		/** idle state */
		_: {
			before: function(){
				this.emit('idle');

				//enable document interavtivity
				css.enableSelection(root);
				if (this.hideCursor) css(root, {"cursor": null});
			},
			'@element touchstart, @element mousedown': function(e){
				e.preventDefault();

				//don’t start double drag (if draggable is within other draggable)
				if (e.target.draggy !== this) return;
				// e.stopPropagation();

				//init drag params
				this.initDragparams(e);

				//do drag on empty threshold
				this.dragstate = 'threshold';

				//with zero-threshold move picker to the point of click
				if (isZero(this.threshold)) {
					this.doDrag(e);
				}
			},

			/** Track kinetic movement */
			track: function(){
				var params = this.dragparams;

				//set initial kinetic props
				params.velocity = 0;
				params.amplitude = 0;
				params.angle = 0;
				params.frame = [params.prevClientX, params.prevClientY];
				params.timestamp = +new Date();
				this.emit('track:defer');
			},

			after: function(){
				//init tracking, if release defined
				this.release && this.track();
			}
		},

		//track velocity
		'threshold, drag': {
			track: function(){
				var params = this.dragparams;

				var now = +new Date;
				var elapsed = now - params.timestamp;

				//get delta movement since the last track
				var deltaX = params.prevClientX - params.frame[0];
				var deltaY = params.prevClientY - params.frame[1];
				params.frame[0] = params.prevClientX;
				params.frame[1] = params.prevClientY;

				var delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

				//get speec (prevent div by zero)
				var v = this.velocity * delta / (1 + elapsed);
				params.velocity = 0.6 * v + 0.4 * params.velocity;

				//get angle
				params.angle = 0.7 * Math.atan2(deltaY, deltaX) + 0.2 * params.angle + 0.1 * Math.atan2(params.frame[0] - params.initClientX, params.frame[1] - params.initClientY);

				this.emit('track:after(20)');
			}
		},

		threshold: {
			before: function(){
				this.emit('threshold');

				//ignore threshold state, if threshold is none
				if (isZero(this.threshold)) return 'drag';
			},

			//update position onmove
			'document touchmove, document mousemove': function(e){
				e.preventDefault();

				//compare movement to the threshold
				var params = this.dragparams;
				var clientX = getClientX(e);
				var clientY = getClientY(e);
				var difX = params.initClientX - clientX;
				var difY = params.initClientY - clientY;

				if (difX < this.threshold[0] || difX > this.threshold[2] || difY < this.threshold[1] || difY > this.threshold[3]) {
					this.initDragparams(e);

					this.dragstate = 'drag';
				}
			},

			//stop drag onleave
			'document touchend, document mouseup, document mouseleave': function(e){
				e.preventDefault();

				this.dragstate = 'idle';
			},

			after: function(){
				//reduce dragging clutter
				css.disableSelection(root);
				if (this.hideCursor) css(root, {"cursor": "none"});
			}
		},

		drag: {
			before: function(){
				css.disableSelection(this.element);

				//emit drag evts
				Emitter.emit(this.element, 'dragstart', null, true)
				.emit(this.element, 'drag', null, true);

				this.emit('dragstart').emit('drag');
			},

			//update position onmove
			'document touchmove, document mousemove': function(e){
				e.preventDefault();
				// e.stopPropagation();

				this.doDrag(e);
			},

			//stop drag onleave
			'document touchend, document mouseup, document mouseleave': function(e){
				e.preventDefault();
				// e.stopPropagation();


				if (this.dragparams.velocity > 1) {
					this.dragstate = 'release';
					return;
				}

				this.dragstate = 'idle';
			},

			after: function(){
				css.enableSelection(this.element);
				Emitter.emit(this.element, 'dragend', null, true);

				this.emit('dragend');
			}
		},

		//inertional moving
		release: {
			before: function(){
				css(this.element, {
					'transition': this.release + 'ms ease-out transform'
				});
				var params = this.dragparams;

				//calc target point & animate to it
				this.x += params.velocity * Math.cos(params.angle);
				this.y += params.velocity * Math.sin(params.angle);

				//release release after 1ms (animation)
				this.emit('stop:after(' + this.release + ')');
			},

			//stop movement
			stop: function (){
				this.dragstate = 'idle';
			},

			after: function(){
				css(this.element, {
					'transition': null
				});

				//remove planned stopping
				this.off('stop');
			}
		}
	},


	/** Callbacks */
	drag: undefined,
	dragstart: undefined,
	dragend: undefined,
	dragrelease: undefined
};



/* ------------------------------    A    P    I    ---------------------------------- */


var DraggyProto = Draggy.prototype;

Enot(DraggyProto);


/** Set drag params for the initial drag */
DraggyProto.initDragparams = function(e){
	//prepare limits & pin for drag session
	this.updateLimits();

	// console.log('---initDragparams')

	var params = this.dragparams;

	//set initial position - have to go after updating limits
	params.prevClientX = getClientX(e);
	params.prevClientY = getClientY(e);

	//if drag started outside the element - align the element centered by pin (excl threshold case)
	if (e.target === this.element) {
		params.innerOffsetX = e.offsetX;
		params.innerOffsetY = e.offsetY;
	}
	else if (this.dragstate === 'threshold'){
		var offsets = this.element.getBoundingClientRect();
		params.innerOffsetX = params.prevClientX - offsets.left;
		params.innerOffsetY = params.prevClientY - offsets.top;
	}
	else {
		params.innerOffsetX = this.pin[0] / 2 + this.pin[2] / 2;
		params.innerOffsetY = this.pin[1] / 2 + this.pin[3] / 2;
	}

	//set initial client x & y
	params.initClientX = params.prevClientX;
	params.initClientY = params.prevClientY;

	return this;
};

DraggyProto.doDrag = function(e){
	// console.log('dodrag')
	var params = this.dragparams;

	var x = getClientX(e),
		y = getClientY(e);
	this.x = x + win.pageXOffset - params.initOffsetX - params.innerOffsetX - params.containerOffsetX;

	this.y = y + win.pageYOffset - params.initOffsetY - params.innerOffsetY - params.containerOffsetY;

	//save dragparams for the next drag call
	params.prevClientX = x;
	params.prevClientY = y;

	//emit drag
	Emitter.emit(this.element, 'drag', null, true);
	this.emit('drag');

	return this;
};


/** Actualize self limits & container offsets */
DraggyProto.updateLimits = function(){
	var within = this.within;
	var pin = this.pin;
	var params = this.dragparams;

	//parse translate x & y
	//they are needed to get real initial offsets on drag start
	var translateStr = this.element.style.transform;
	var m1 = /-?\b[\d\.]+/.exec(translateStr);
	var tx = parseFloat(m1[0]);
	translateStr = translateStr.slice(m1.index + m1[0].length);
	var m2 =  /-?\b[\d\.]+/.exec(translateStr);
	var ty = parseFloat(m2[0]);


	var selfOffsets = css.offsets(this.element);

	//initial offsets from the `limitEl`, 0-translation (only first init)
	params.initOffsetX = selfOffsets.left - tx;
	params.initOffsetY = selfOffsets.top - ty;

	//ignore undefined restriction container
	if (!within) return;

	var containerOffsets = css.offsets(within);
	var paddings = css.paddings(within);


	//initial container offsets from page
	params.containerOffsetX = containerOffsets.left;
	params.containerOffsetY = containerOffsets.top;


	//correct init offsets
	params.initOffsetX -= containerOffsets.left;
	params.initOffsetY -= containerOffsets.top;

	//save limits && offsets
	this.limits = {
		left: -pin[0] - params.initOffsetX + paddings.left,
		top: -pin[1] - params.initOffsetY + paddings.top,
		right: -params.initOffsetX + containerOffsets.width - pin[2] - paddings.right,
		bottom: -params.initOffsetY + containerOffsets.height - pin[3] - paddings.bottom
	};
};


/** deconstructor - removes any memory bindings */
DraggyProto.destroy = function(){
	//TODO: unbind all events

	//remove references
	this.element.draggy = null;
	this.element = null;
};



/* ---------------------------------- H E L P E R S ---------------------------------- */


/** Check whether arr is filled with zeros */
function isZero(arr){
	if (!arr[0] && !arr[1] && !arr[2] && !arr[3]) return true;
}


/**
 * get clientY/clientY from event
 *
 * @param {Event} e Event raised, like mousemove
 *
 * @return {number} Coordinate relative to the screen
 */
function getClientY(e){
	// touch event
	if (e.targetTouches && (e.targetTouches.length >= 1)) {
		return e.targetTouches[0].clientY;
	}

	// mouse event
	return e.clientY;
}
function getClientX(e){
	// touch event
	if (e.targetTouches && (e.targetTouches.length >= 1)) {
		return e.targetTouches[0].clientX;
	}

	// mouse event
	return e.clientX;
}