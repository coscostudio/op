"use strict";
(() => {
  // bin/live-reload.js
  new EventSource(`${"http://localhost:3000"}/esbuild`).addEventListener("change", () => location.reload());

  // node_modules/.pnpm/@finsweet+ts-utils@0.40.0/node_modules/@finsweet/ts-utils/dist/webflow/getPublishDate.js
  var getPublishDate = (page = document) => {
    const publishDatePrefix = "Last Published:";
    for (const node of page.childNodes) {
      if (node.nodeType === Node.COMMENT_NODE && node.textContent?.includes(publishDatePrefix)) {
        const publishDateValue = node.textContent.trim().split(publishDatePrefix)[1];
        if (publishDateValue)
          return new Date(publishDateValue);
      }
    }
  };

  // src/utils/greet.ts
  var greetUser = (name) => {
    const publishDate = getPublishDate();
    console.log(`Hello ${name}!`);
    console.log(
      `This site was last published on ${publishDate?.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "2-digit"
      })}.`
    );
  };

  // node_modules/.pnpm/lenis@1.3.18-dev.1/node_modules/lenis/dist/lenis.mjs
  var version = "1.3.18-dev.1";
  function clamp(min, input, max) {
    return Math.max(min, Math.min(input, max));
  }
  function lerp(x, y, t) {
    return (1 - t) * x + t * y;
  }
  function damp(x, y, lambda, deltaTime) {
    return lerp(x, y, 1 - Math.exp(-lambda * deltaTime));
  }
  function modulo(n, d) {
    return (n % d + d) % d;
  }
  var Animate = class {
    isRunning = false;
    value = 0;
    from = 0;
    to = 0;
    currentTime = 0;
    // These are instanciated in the fromTo method
    lerp;
    duration;
    easing;
    onUpdate;
    /**
     * Advance the animation by the given delta time
     *
     * @param deltaTime - The time in seconds to advance the animation
     */
    advance(deltaTime) {
      if (!this.isRunning) return;
      let completed = false;
      if (this.duration && this.easing) {
        this.currentTime += deltaTime;
        const linearProgress = clamp(0, this.currentTime / this.duration, 1);
        completed = linearProgress >= 1;
        const easedProgress = completed ? 1 : this.easing(linearProgress);
        this.value = this.from + (this.to - this.from) * easedProgress;
      } else if (this.lerp) {
        this.value = damp(this.value, this.to, this.lerp * 60, deltaTime);
        if (Math.round(this.value) === this.to) {
          this.value = this.to;
          completed = true;
        }
      } else {
        this.value = this.to;
        completed = true;
      }
      if (completed) {
        this.stop();
      }
      this.onUpdate?.(this.value, completed);
    }
    /** Stop the animation */
    stop() {
      this.isRunning = false;
    }
    /**
     * Set up the animation from a starting value to an ending value
     * with optional parameters for lerping, duration, easing, and onUpdate callback
     *
     * @param from - The starting value
     * @param to - The ending value
     * @param options - Options for the animation
     */
    fromTo(from, to, { lerp: lerp2, duration, easing, onStart, onUpdate }) {
      this.from = this.value = from;
      this.to = to;
      this.lerp = lerp2;
      this.duration = duration;
      this.easing = easing;
      this.currentTime = 0;
      this.isRunning = true;
      onStart?.();
      this.onUpdate = onUpdate;
    }
  };
  function debounce(callback, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        callback.apply(this, args);
      }, delay);
    };
  }
  var Dimensions = class {
    constructor(wrapper, content, { autoResize = true, debounce: debounceValue = 250 } = {}) {
      this.wrapper = wrapper;
      this.content = content;
      if (autoResize) {
        this.debouncedResize = debounce(this.resize, debounceValue);
        if (this.wrapper instanceof Window) {
          window.addEventListener("resize", this.debouncedResize, false);
        } else {
          this.wrapperResizeObserver = new ResizeObserver(this.debouncedResize);
          this.wrapperResizeObserver.observe(this.wrapper);
        }
        this.contentResizeObserver = new ResizeObserver(this.debouncedResize);
        this.contentResizeObserver.observe(this.content);
      }
      this.resize();
    }
    width = 0;
    height = 0;
    scrollHeight = 0;
    scrollWidth = 0;
    // These are instanciated in the constructor as they need information from the options
    debouncedResize;
    wrapperResizeObserver;
    contentResizeObserver;
    destroy() {
      this.wrapperResizeObserver?.disconnect();
      this.contentResizeObserver?.disconnect();
      if (this.wrapper === window && this.debouncedResize) {
        window.removeEventListener("resize", this.debouncedResize, false);
      }
    }
    resize = () => {
      this.onWrapperResize();
      this.onContentResize();
    };
    onWrapperResize = () => {
      if (this.wrapper instanceof Window) {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
      } else {
        this.width = this.wrapper.clientWidth;
        this.height = this.wrapper.clientHeight;
      }
    };
    onContentResize = () => {
      if (this.wrapper instanceof Window) {
        this.scrollHeight = this.content.scrollHeight;
        this.scrollWidth = this.content.scrollWidth;
      } else {
        this.scrollHeight = this.wrapper.scrollHeight;
        this.scrollWidth = this.wrapper.scrollWidth;
      }
    };
    get limit() {
      return {
        x: this.scrollWidth - this.width,
        y: this.scrollHeight - this.height
      };
    }
  };
  var Emitter = class {
    events = {};
    /**
     * Emit an event with the given data
     * @param event Event name
     * @param args Data to pass to the event handlers
     */
    emit(event, ...args) {
      const callbacks = this.events[event] || [];
      for (let i = 0, length = callbacks.length; i < length; i++) {
        callbacks[i]?.(...args);
      }
    }
    /**
     * Add a callback to the event
     * @param event Event name
     * @param cb Callback function
     * @returns Unsubscribe function
     */
    on(event, cb) {
      if (this.events[event]) {
        this.events[event].push(cb);
      } else {
        this.events[event] = [cb];
      }
      return () => {
        this.events[event] = this.events[event]?.filter((i) => cb !== i);
      };
    }
    /**
     * Remove a callback from the event
     * @param event Event name
     * @param callback Callback function
     */
    off(event, callback) {
      this.events[event] = this.events[event]?.filter((i) => callback !== i);
    }
    /**
     * Remove all event listeners and clean up
     */
    destroy() {
      this.events = {};
    }
  };
  var LINE_HEIGHT = 100 / 6;
  var listenerOptions = { passive: false };
  function getDeltaMultiplier(deltaMode, size) {
    if (deltaMode === 1) return LINE_HEIGHT;
    if (deltaMode === 2) return size;
    return 1;
  }
  var VirtualScroll = class {
    constructor(element, options = { wheelMultiplier: 1, touchMultiplier: 1 }) {
      this.element = element;
      this.options = options;
      window.addEventListener("resize", this.onWindowResize, false);
      this.onWindowResize();
      this.element.addEventListener("wheel", this.onWheel, listenerOptions);
      this.element.addEventListener(
        "touchstart",
        this.onTouchStart,
        listenerOptions
      );
      this.element.addEventListener(
        "touchmove",
        this.onTouchMove,
        listenerOptions
      );
      this.element.addEventListener("touchend", this.onTouchEnd, listenerOptions);
    }
    touchStart = {
      x: 0,
      y: 0
    };
    lastDelta = {
      x: 0,
      y: 0
    };
    window = {
      width: 0,
      height: 0
    };
    emitter = new Emitter();
    /**
     * Add an event listener for the given event and callback
     *
     * @param event Event name
     * @param callback Callback function
     */
    on(event, callback) {
      return this.emitter.on(event, callback);
    }
    /** Remove all event listeners and clean up */
    destroy() {
      this.emitter.destroy();
      window.removeEventListener("resize", this.onWindowResize, false);
      this.element.removeEventListener("wheel", this.onWheel, listenerOptions);
      this.element.removeEventListener(
        "touchstart",
        this.onTouchStart,
        listenerOptions
      );
      this.element.removeEventListener(
        "touchmove",
        this.onTouchMove,
        listenerOptions
      );
      this.element.removeEventListener(
        "touchend",
        this.onTouchEnd,
        listenerOptions
      );
    }
    /**
     * Event handler for 'touchstart' event
     *
     * @param event Touch event
     */
    onTouchStart = (event) => {
      const { clientX, clientY } = event.targetTouches ? event.targetTouches[0] : event;
      this.touchStart.x = clientX;
      this.touchStart.y = clientY;
      this.lastDelta = {
        x: 0,
        y: 0
      };
      this.emitter.emit("scroll", {
        deltaX: 0,
        deltaY: 0,
        event
      });
    };
    /** Event handler for 'touchmove' event */
    onTouchMove = (event) => {
      const { clientX, clientY } = event.targetTouches ? event.targetTouches[0] : event;
      const deltaX = -(clientX - this.touchStart.x) * this.options.touchMultiplier;
      const deltaY = -(clientY - this.touchStart.y) * this.options.touchMultiplier;
      this.touchStart.x = clientX;
      this.touchStart.y = clientY;
      this.lastDelta = {
        x: deltaX,
        y: deltaY
      };
      this.emitter.emit("scroll", {
        deltaX,
        deltaY,
        event
      });
    };
    onTouchEnd = (event) => {
      this.emitter.emit("scroll", {
        deltaX: this.lastDelta.x,
        deltaY: this.lastDelta.y,
        event
      });
    };
    /** Event handler for 'wheel' event */
    onWheel = (event) => {
      let { deltaX, deltaY, deltaMode } = event;
      const multiplierX = getDeltaMultiplier(deltaMode, this.window.width);
      const multiplierY = getDeltaMultiplier(deltaMode, this.window.height);
      deltaX *= multiplierX;
      deltaY *= multiplierY;
      deltaX *= this.options.wheelMultiplier;
      deltaY *= this.options.wheelMultiplier;
      this.emitter.emit("scroll", { deltaX, deltaY, event });
    };
    onWindowResize = () => {
      this.window = {
        width: window.innerWidth,
        height: window.innerHeight
      };
    };
  };
  var defaultEasing = (t) => Math.min(1, 1.001 - 2 ** (-10 * t));
  var Lenis = class {
    _isScrolling = false;
    // true when scroll is animating
    _isStopped = false;
    // true if user should not be able to scroll - enable/disable programmatically
    _isLocked = false;
    // same as isStopped but enabled/disabled when scroll reaches target
    _preventNextNativeScrollEvent = false;
    _resetVelocityTimeout = null;
    _rafId = null;
    /**
     * Whether or not the user is touching the screen
     */
    isTouching;
    /**
     * The time in ms since the lenis instance was created
     */
    time = 0;
    /**
     * User data that will be forwarded through the scroll event
     *
     * @example
     * lenis.scrollTo(100, {
     *   userData: {
     *     foo: 'bar'
     *   }
     * })
     */
    userData = {};
    /**
     * The last velocity of the scroll
     */
    lastVelocity = 0;
    /**
     * The current velocity of the scroll
     */
    velocity = 0;
    /**
     * The direction of the scroll
     */
    direction = 0;
    /**
     * The options passed to the lenis instance
     */
    options;
    /**
     * The target scroll value
     */
    targetScroll;
    /**
     * The animated scroll value
     */
    animatedScroll;
    // These are instanciated here as they don't need information from the options
    animate = new Animate();
    emitter = new Emitter();
    // These are instanciated in the constructor as they need information from the options
    dimensions;
    // This is not private because it's used in the Snap class
    virtualScroll;
    constructor({
      wrapper = window,
      content = document.documentElement,
      eventsTarget = wrapper,
      smoothWheel = true,
      syncTouch = false,
      syncTouchLerp = 0.075,
      touchInertiaExponent = 1.7,
      duration,
      // in seconds
      easing,
      lerp: lerp2 = 0.1,
      infinite = false,
      orientation = "vertical",
      // vertical, horizontal
      gestureOrientation = orientation === "horizontal" ? "both" : "vertical",
      // vertical, horizontal, both
      touchMultiplier = 1,
      wheelMultiplier = 1,
      autoResize = true,
      prevent,
      virtualScroll,
      overscroll = true,
      autoRaf = false,
      anchors = false,
      autoToggle = false,
      // https://caniuse.com/?search=transition-behavior
      allowNestedScroll = false,
      __experimental__naiveDimensions = false,
      naiveDimensions = __experimental__naiveDimensions,
      stopInertiaOnNavigate = false
    } = {}) {
      window.lenisVersion = version;
      if (!wrapper || wrapper === document.documentElement) {
        wrapper = window;
      }
      if (typeof duration === "number" && typeof easing !== "function") {
        easing = defaultEasing;
      } else if (typeof easing === "function" && typeof duration !== "number") {
        duration = 1;
      }
      this.options = {
        wrapper,
        content,
        eventsTarget,
        smoothWheel,
        syncTouch,
        syncTouchLerp,
        touchInertiaExponent,
        duration,
        easing,
        lerp: lerp2,
        infinite,
        gestureOrientation,
        orientation,
        touchMultiplier,
        wheelMultiplier,
        autoResize,
        prevent,
        virtualScroll,
        overscroll,
        autoRaf,
        anchors,
        autoToggle,
        allowNestedScroll,
        naiveDimensions,
        stopInertiaOnNavigate
      };
      this.dimensions = new Dimensions(wrapper, content, { autoResize });
      this.updateClassName();
      this.targetScroll = this.animatedScroll = this.actualScroll;
      this.options.wrapper.addEventListener("scroll", this.onNativeScroll, false);
      this.options.wrapper.addEventListener("scrollend", this.onScrollEnd, {
        capture: true
      });
      if (this.options.anchors || this.options.stopInertiaOnNavigate) {
        this.options.wrapper.addEventListener(
          "click",
          this.onClick,
          false
        );
      }
      this.options.wrapper.addEventListener(
        "pointerdown",
        this.onPointerDown,
        false
      );
      this.virtualScroll = new VirtualScroll(eventsTarget, {
        touchMultiplier,
        wheelMultiplier
      });
      this.virtualScroll.on("scroll", this.onVirtualScroll);
      if (this.options.autoToggle) {
        this.checkOverflow();
        this.rootElement.addEventListener("transitionend", this.onTransitionEnd, {
          passive: true
        });
      }
      if (this.options.autoRaf) {
        this._rafId = requestAnimationFrame(this.raf);
      }
    }
    /**
     * Destroy the lenis instance, remove all event listeners and clean up the class name
     */
    destroy() {
      this.emitter.destroy();
      this.options.wrapper.removeEventListener(
        "scroll",
        this.onNativeScroll,
        false
      );
      this.options.wrapper.removeEventListener("scrollend", this.onScrollEnd, {
        capture: true
      });
      this.options.wrapper.removeEventListener(
        "pointerdown",
        this.onPointerDown,
        false
      );
      if (this.options.anchors || this.options.stopInertiaOnNavigate) {
        this.options.wrapper.removeEventListener(
          "click",
          this.onClick,
          false
        );
      }
      this.virtualScroll.destroy();
      this.dimensions.destroy();
      this.cleanUpClassName();
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
      }
    }
    on(event, callback) {
      return this.emitter.on(event, callback);
    }
    off(event, callback) {
      return this.emitter.off(event, callback);
    }
    onScrollEnd = (e) => {
      if (!(e instanceof CustomEvent)) {
        if (this.isScrolling === "smooth" || this.isScrolling === false) {
          e.stopPropagation();
        }
      }
    };
    dispatchScrollendEvent = () => {
      this.options.wrapper.dispatchEvent(
        new CustomEvent("scrollend", {
          bubbles: this.options.wrapper === window,
          // cancelable: false,
          detail: {
            lenisScrollEnd: true
          }
        })
      );
    };
    get overflow() {
      const property = this.isHorizontal ? "overflow-x" : "overflow-y";
      return getComputedStyle(this.rootElement)[property];
    }
    checkOverflow() {
      if (["hidden", "clip"].includes(this.overflow)) {
        this.internalStop();
      } else {
        this.internalStart();
      }
    }
    onTransitionEnd = (event) => {
      if (event.propertyName.includes("overflow")) {
        this.checkOverflow();
      }
    };
    setScroll(scroll) {
      if (this.isHorizontal) {
        this.options.wrapper.scrollTo({ left: scroll, behavior: "instant" });
      } else {
        this.options.wrapper.scrollTo({ top: scroll, behavior: "instant" });
      }
    }
    onClick = (event) => {
      const path = event.composedPath();
      const anchorElements = path.filter(
        (node) => node instanceof HTMLAnchorElement && node.getAttribute("href")
      );
      if (this.options.anchors) {
        const anchor = anchorElements.find(
          (node) => node.getAttribute("href")?.includes("#")
        );
        if (anchor) {
          const href = anchor.getAttribute("href");
          if (href) {
            const options = typeof this.options.anchors === "object" && this.options.anchors ? this.options.anchors : void 0;
            const target = `#${href.split("#")[1]}`;
            this.scrollTo(target, options);
          }
        }
      }
      if (this.options.stopInertiaOnNavigate) {
        const internalLink = anchorElements.find(
          (node) => node.host === window.location.host
        );
        if (internalLink) {
          this.reset();
        }
      }
    };
    onPointerDown = (event) => {
      if (event.button === 1) {
        this.reset();
      }
    };
    onVirtualScroll = (data) => {
      if (typeof this.options.virtualScroll === "function" && this.options.virtualScroll(data) === false)
        return;
      const { deltaX, deltaY, event } = data;
      this.emitter.emit("virtual-scroll", { deltaX, deltaY, event });
      if (event.ctrlKey) return;
      if (event.lenisStopPropagation) return;
      const isTouch = event.type.includes("touch");
      const isWheel = event.type.includes("wheel");
      this.isTouching = event.type === "touchstart" || event.type === "touchmove";
      const isClickOrTap = deltaX === 0 && deltaY === 0;
      const isTapToStop = this.options.syncTouch && isTouch && event.type === "touchstart" && isClickOrTap && !this.isStopped && !this.isLocked;
      if (isTapToStop) {
        this.reset();
        return;
      }
      const isUnknownGesture = this.options.gestureOrientation === "vertical" && deltaY === 0 || this.options.gestureOrientation === "horizontal" && deltaX === 0;
      if (isClickOrTap || isUnknownGesture) {
        return;
      }
      let composedPath = event.composedPath();
      composedPath = composedPath.slice(0, composedPath.indexOf(this.rootElement));
      const prevent = this.options.prevent;
      const gestureOrientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
      if (composedPath.find(
        (node) => node instanceof HTMLElement && (typeof prevent === "function" && prevent?.(node) || node.hasAttribute?.("data-lenis-prevent") || gestureOrientation === "vertical" && node.hasAttribute?.("data-lenis-prevent-vertical") || gestureOrientation === "horizontal" && node.hasAttribute?.("data-lenis-prevent-horizontal") || isTouch && node.hasAttribute?.("data-lenis-prevent-touch") || isWheel && node.hasAttribute?.("data-lenis-prevent-wheel") || this.options.allowNestedScroll && this.hasNestedScroll(node, {
          deltaX,
          deltaY
        }))
      ))
        return;
      if (this.isStopped || this.isLocked) {
        if (event.cancelable) {
          event.preventDefault();
        }
        return;
      }
      const isSmooth = this.options.syncTouch && isTouch || this.options.smoothWheel && isWheel;
      if (!isSmooth) {
        this.isScrolling = "native";
        this.animate.stop();
        event.lenisStopPropagation = true;
        return;
      }
      let delta = deltaY;
      if (this.options.gestureOrientation === "both") {
        delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
      } else if (this.options.gestureOrientation === "horizontal") {
        delta = deltaX;
      }
      if (!this.options.overscroll || this.options.infinite || this.options.wrapper !== window && this.limit > 0 && (this.animatedScroll > 0 && this.animatedScroll < this.limit || this.animatedScroll === 0 && deltaY > 0 || this.animatedScroll === this.limit && deltaY < 0)) {
        event.lenisStopPropagation = true;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      const isSyncTouch = isTouch && this.options.syncTouch;
      const isTouchEnd = isTouch && event.type === "touchend";
      const hasTouchInertia = isTouchEnd;
      if (hasTouchInertia) {
        delta = Math.sign(this.velocity) * Math.abs(this.velocity) ** this.options.touchInertiaExponent;
      }
      this.scrollTo(this.targetScroll + delta, {
        programmatic: false,
        ...isSyncTouch ? {
          lerp: hasTouchInertia ? this.options.syncTouchLerp : 1
        } : {
          lerp: this.options.lerp,
          duration: this.options.duration,
          easing: this.options.easing
        }
      });
    };
    /**
     * Force lenis to recalculate the dimensions
     */
    resize() {
      this.dimensions.resize();
      this.animatedScroll = this.targetScroll = this.actualScroll;
      this.emit();
    }
    emit() {
      this.emitter.emit("scroll", this);
    }
    onNativeScroll = () => {
      if (this._resetVelocityTimeout !== null) {
        clearTimeout(this._resetVelocityTimeout);
        this._resetVelocityTimeout = null;
      }
      if (this._preventNextNativeScrollEvent) {
        this._preventNextNativeScrollEvent = false;
        return;
      }
      if (this.isScrolling === false || this.isScrolling === "native") {
        const lastScroll = this.animatedScroll;
        this.animatedScroll = this.targetScroll = this.actualScroll;
        this.lastVelocity = this.velocity;
        this.velocity = this.animatedScroll - lastScroll;
        this.direction = Math.sign(
          this.animatedScroll - lastScroll
        );
        if (!this.isStopped) {
          this.isScrolling = "native";
        }
        this.emit();
        if (this.velocity !== 0) {
          this._resetVelocityTimeout = setTimeout(() => {
            this.lastVelocity = this.velocity;
            this.velocity = 0;
            this.isScrolling = false;
            this.emit();
          }, 400);
        }
      }
    };
    reset() {
      this.isLocked = false;
      this.isScrolling = false;
      this.animatedScroll = this.targetScroll = this.actualScroll;
      this.lastVelocity = this.velocity = 0;
      this.animate.stop();
    }
    /**
     * Start lenis scroll after it has been stopped
     */
    start() {
      if (!this.isStopped) return;
      if (this.options.autoToggle) {
        this.rootElement.style.removeProperty("overflow");
        return;
      }
      this.internalStart();
    }
    internalStart() {
      if (!this.isStopped) return;
      this.reset();
      this.isStopped = false;
      this.emit();
    }
    /**
     * Stop lenis scroll
     */
    stop() {
      if (this.isStopped) return;
      if (this.options.autoToggle) {
        this.rootElement.style.setProperty("overflow", "clip");
        return;
      }
      this.internalStop();
    }
    internalStop() {
      if (this.isStopped) return;
      this.reset();
      this.isStopped = true;
      this.emit();
    }
    /**
     * RequestAnimationFrame for lenis
     *
     * @param time The time in ms from an external clock like `requestAnimationFrame` or Tempus
     */
    raf = (time) => {
      const deltaTime = time - (this.time || time);
      this.time = time;
      this.animate.advance(deltaTime * 1e-3);
      if (this.options.autoRaf) {
        this._rafId = requestAnimationFrame(this.raf);
      }
    };
    /**
     * Scroll to a target value
     *
     * @param target The target value to scroll to
     * @param options The options for the scroll
     *
     * @example
     * lenis.scrollTo(100, {
     *   offset: 100,
     *   duration: 1,
     *   easing: (t) => 1 - Math.cos((t * Math.PI) / 2),
     *   lerp: 0.1,
     *   onStart: () => {
     *     console.log('onStart')
     *   },
     *   onComplete: () => {
     *     console.log('onComplete')
     *   },
     * })
     */
    scrollTo(_target, {
      offset = 0,
      immediate = false,
      lock = false,
      programmatic = true,
      // called from outside of the class
      lerp: lerp2 = programmatic ? this.options.lerp : void 0,
      duration = programmatic ? this.options.duration : void 0,
      easing = programmatic ? this.options.easing : void 0,
      onStart,
      onComplete,
      force = false,
      // scroll even if stopped
      userData
    } = {}) {
      if ((this.isStopped || this.isLocked) && !force) return;
      let target = _target;
      let adjustedOffset = offset;
      if (typeof target === "string" && ["top", "left", "start", "#"].includes(target)) {
        target = 0;
      } else if (typeof target === "string" && ["bottom", "right", "end"].includes(target)) {
        target = this.limit;
      } else {
        let node = null;
        if (typeof target === "string") {
          node = document.querySelector(target);
          if (!node) {
            if (target === "#top") {
              target = 0;
            } else {
              console.warn("Lenis: Target not found", target);
            }
          }
        } else if (target instanceof HTMLElement && target?.nodeType) {
          node = target;
        }
        if (node) {
          if (this.options.wrapper !== window) {
            const wrapperRect = this.rootElement.getBoundingClientRect();
            adjustedOffset -= this.isHorizontal ? wrapperRect.left : wrapperRect.top;
          }
          const rect = node.getBoundingClientRect();
          target = (this.isHorizontal ? rect.left : rect.top) + this.animatedScroll;
        }
      }
      if (typeof target !== "number") return;
      target += adjustedOffset;
      target = Math.round(target);
      if (this.options.infinite) {
        if (programmatic) {
          this.targetScroll = this.animatedScroll = this.scroll;
          const distance = target - this.animatedScroll;
          if (distance > this.limit / 2) {
            target -= this.limit;
          } else if (distance < -this.limit / 2) {
            target += this.limit;
          }
        }
      } else {
        target = clamp(0, target, this.limit);
      }
      if (target === this.targetScroll) {
        onStart?.(this);
        onComplete?.(this);
        return;
      }
      this.userData = userData ?? {};
      if (immediate) {
        this.animatedScroll = this.targetScroll = target;
        this.setScroll(this.scroll);
        this.reset();
        this.preventNextNativeScrollEvent();
        this.emit();
        onComplete?.(this);
        this.userData = {};
        requestAnimationFrame(() => {
          this.dispatchScrollendEvent();
        });
        return;
      }
      if (!programmatic) {
        this.targetScroll = target;
      }
      if (typeof duration === "number" && typeof easing !== "function") {
        easing = defaultEasing;
      } else if (typeof easing === "function" && typeof duration !== "number") {
        duration = 1;
      }
      this.animate.fromTo(this.animatedScroll, target, {
        duration,
        easing,
        lerp: lerp2,
        onStart: () => {
          if (lock) this.isLocked = true;
          this.isScrolling = "smooth";
          onStart?.(this);
        },
        onUpdate: (value, completed) => {
          this.isScrolling = "smooth";
          this.lastVelocity = this.velocity;
          this.velocity = value - this.animatedScroll;
          this.direction = Math.sign(this.velocity);
          this.animatedScroll = value;
          this.setScroll(this.scroll);
          if (programmatic) {
            this.targetScroll = value;
          }
          if (!completed) this.emit();
          if (completed) {
            this.reset();
            this.emit();
            onComplete?.(this);
            this.userData = {};
            requestAnimationFrame(() => {
              this.dispatchScrollendEvent();
            });
            this.preventNextNativeScrollEvent();
          }
        }
      });
    }
    preventNextNativeScrollEvent() {
      this._preventNextNativeScrollEvent = true;
      requestAnimationFrame(() => {
        this._preventNextNativeScrollEvent = false;
      });
    }
    hasNestedScroll(node, { deltaX, deltaY }) {
      const time = Date.now();
      if (!node._lenis) node._lenis = {};
      const cache = node._lenis;
      let hasOverflowX;
      let hasOverflowY;
      let isScrollableX;
      let isScrollableY;
      let hasOverscrollBehaviorX;
      let hasOverscrollBehaviorY;
      let scrollWidth;
      let scrollHeight;
      let clientWidth;
      let clientHeight;
      if (time - (cache.time ?? 0) > 2e3) {
        cache.time = Date.now();
        const computedStyle = window.getComputedStyle(node);
        cache.computedStyle = computedStyle;
        hasOverflowX = ["auto", "overlay", "scroll"].includes(
          computedStyle.overflowX
        );
        hasOverflowY = ["auto", "overlay", "scroll"].includes(
          computedStyle.overflowY
        );
        hasOverscrollBehaviorX = ["auto"].includes(
          computedStyle.overscrollBehaviorX
        );
        hasOverscrollBehaviorY = ["auto"].includes(
          computedStyle.overscrollBehaviorY
        );
        cache.hasOverflowX = hasOverflowX;
        cache.hasOverflowY = hasOverflowY;
        if (!(hasOverflowX || hasOverflowY)) return false;
        scrollWidth = node.scrollWidth;
        scrollHeight = node.scrollHeight;
        clientWidth = node.clientWidth;
        clientHeight = node.clientHeight;
        isScrollableX = scrollWidth > clientWidth;
        isScrollableY = scrollHeight > clientHeight;
        cache.isScrollableX = isScrollableX;
        cache.isScrollableY = isScrollableY;
        cache.scrollWidth = scrollWidth;
        cache.scrollHeight = scrollHeight;
        cache.clientWidth = clientWidth;
        cache.clientHeight = clientHeight;
        cache.hasOverscrollBehaviorX = hasOverscrollBehaviorX;
        cache.hasOverscrollBehaviorY = hasOverscrollBehaviorY;
      } else {
        isScrollableX = cache.isScrollableX;
        isScrollableY = cache.isScrollableY;
        hasOverflowX = cache.hasOverflowX;
        hasOverflowY = cache.hasOverflowY;
        scrollWidth = cache.scrollWidth;
        scrollHeight = cache.scrollHeight;
        clientWidth = cache.clientWidth;
        clientHeight = cache.clientHeight;
        hasOverscrollBehaviorX = cache.hasOverscrollBehaviorX;
        hasOverscrollBehaviorY = cache.hasOverscrollBehaviorY;
      }
      if (!(hasOverflowX && isScrollableX || hasOverflowY && isScrollableY)) {
        return false;
      }
      const orientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
      let scroll;
      let maxScroll;
      let delta;
      let hasOverflow;
      let isScrollable;
      let hasOverscrollBehavior;
      if (orientation === "horizontal") {
        scroll = Math.round(node.scrollLeft);
        maxScroll = scrollWidth - clientWidth;
        delta = deltaX;
        hasOverflow = hasOverflowX;
        isScrollable = isScrollableX;
        hasOverscrollBehavior = hasOverscrollBehaviorX;
      } else if (orientation === "vertical") {
        scroll = Math.round(node.scrollTop);
        maxScroll = scrollHeight - clientHeight;
        delta = deltaY;
        hasOverflow = hasOverflowY;
        isScrollable = isScrollableY;
        hasOverscrollBehavior = hasOverscrollBehaviorY;
      } else {
        return false;
      }
      if (!hasOverscrollBehavior && (scroll === maxScroll || scroll === 0)) {
        return true;
      }
      const willScroll = delta > 0 ? scroll < maxScroll : scroll > 0;
      return willScroll && hasOverflow && isScrollable;
    }
    /**
     * The root element on which lenis is instanced
     */
    get rootElement() {
      return this.options.wrapper === window ? document.documentElement : this.options.wrapper;
    }
    /**
     * The limit which is the maximum scroll value
     */
    get limit() {
      if (this.options.naiveDimensions) {
        if (this.isHorizontal) {
          return this.rootElement.scrollWidth - this.rootElement.clientWidth;
        }
        return this.rootElement.scrollHeight - this.rootElement.clientHeight;
      }
      return this.dimensions.limit[this.isHorizontal ? "x" : "y"];
    }
    /**
     * Whether or not the scroll is horizontal
     */
    get isHorizontal() {
      return this.options.orientation === "horizontal";
    }
    /**
     * The actual scroll value
     */
    get actualScroll() {
      const wrapper = this.options.wrapper;
      return this.isHorizontal ? wrapper.scrollX ?? wrapper.scrollLeft : wrapper.scrollY ?? wrapper.scrollTop;
    }
    /**
     * The current scroll value
     */
    get scroll() {
      return this.options.infinite ? modulo(this.animatedScroll, this.limit) : this.animatedScroll;
    }
    /**
     * The progress of the scroll relative to the limit
     */
    get progress() {
      return this.limit === 0 ? 1 : this.scroll / this.limit;
    }
    /**
     * Current scroll state
     */
    get isScrolling() {
      return this._isScrolling;
    }
    set isScrolling(value) {
      if (this._isScrolling !== value) {
        this._isScrolling = value;
        this.updateClassName();
      }
    }
    /**
     * Check if lenis is stopped
     */
    get isStopped() {
      return this._isStopped;
    }
    set isStopped(value) {
      if (this._isStopped !== value) {
        this._isStopped = value;
        this.updateClassName();
      }
    }
    /**
     * Check if lenis is locked
     */
    get isLocked() {
      return this._isLocked;
    }
    set isLocked(value) {
      if (this._isLocked !== value) {
        this._isLocked = value;
        this.updateClassName();
      }
    }
    /**
     * Check if lenis is smooth scrolling
     */
    get isSmooth() {
      return this.isScrolling === "smooth";
    }
    /**
     * The class name applied to the wrapper element
     */
    get className() {
      let className = "lenis";
      if (this.options.autoToggle) className += " lenis-autoToggle";
      if (this.isStopped) className += " lenis-stopped";
      if (this.isLocked) className += " lenis-locked";
      if (this.isScrolling) className += " lenis-scrolling";
      if (this.isScrolling === "smooth") className += " lenis-smooth";
      return className;
    }
    updateClassName() {
      this.cleanUpClassName();
      this.rootElement.className = `${this.rootElement.className} ${this.className}`.trim();
    }
    cleanUpClassName() {
      this.rootElement.className = this.rootElement.className.replace(/lenis(-\w+)?/g, "").trim();
    }
  };

  // node_modules/.pnpm/lenis@1.3.18-dev.1/node_modules/lenis/dist/lenis-snap.mjs
  function debounce2(callback, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        callback.apply(this, args);
      }, delay);
    };
  }
  function removeParentSticky(element) {
    const position = getComputedStyle(element).position;
    const isSticky = position === "sticky";
    if (isSticky) {
      element.style.setProperty("position", "static");
      element.dataset.sticky = "true";
    }
    if (element.offsetParent) {
      removeParentSticky(element.offsetParent);
    }
  }
  function addParentSticky(element) {
    if (element?.dataset?.sticky === "true") {
      element.style.removeProperty("position");
      delete element.dataset.sticky;
    }
    if (element.offsetParent) {
      addParentSticky(element.offsetParent);
    }
  }
  function offsetTop(element, accumulator = 0) {
    const top = accumulator + element.offsetTop;
    if (element.offsetParent) {
      return offsetTop(element.offsetParent, top);
    }
    return top;
  }
  function offsetLeft(element, accumulator = 0) {
    const left = accumulator + element.offsetLeft;
    if (element.offsetParent) {
      return offsetLeft(element.offsetParent, left);
    }
    return left;
  }
  function scrollTop(element, accumulator = 0) {
    const top = accumulator + element.scrollTop;
    if (element.offsetParent) {
      return scrollTop(element.offsetParent, top);
    }
    return top + window.scrollY;
  }
  function scrollLeft(element, accumulator = 0) {
    const left = accumulator + element.scrollLeft;
    if (element.offsetParent) {
      return scrollLeft(element.offsetParent, left);
    }
    return left + window.scrollX;
  }
  var SnapElement = class {
    element;
    options;
    align;
    // @ts-expect-error
    rect = {};
    wrapperResizeObserver;
    resizeObserver;
    debouncedWrapperResize;
    constructor(element, {
      align = ["start"],
      ignoreSticky = true,
      ignoreTransform = false
    } = {}) {
      this.element = element;
      this.options = { align, ignoreSticky, ignoreTransform };
      this.align = [align].flat();
      this.debouncedWrapperResize = debounce2(this.onWrapperResize, 500);
      this.wrapperResizeObserver = new ResizeObserver(this.debouncedWrapperResize);
      this.wrapperResizeObserver.observe(document.body);
      this.onWrapperResize();
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.element);
      this.setRect({
        width: this.element.offsetWidth,
        height: this.element.offsetHeight
      });
    }
    destroy() {
      this.wrapperResizeObserver.disconnect();
      this.resizeObserver.disconnect();
    }
    setRect({
      top,
      left,
      width,
      height,
      element
    } = {}) {
      top = top ?? this.rect.top;
      left = left ?? this.rect.left;
      width = width ?? this.rect.width;
      height = height ?? this.rect.height;
      element = element ?? this.rect.element;
      if (top === this.rect.top && left === this.rect.left && width === this.rect.width && height === this.rect.height && element === this.rect.element)
        return;
      this.rect.top = top;
      this.rect.y = top;
      this.rect.width = width;
      this.rect.height = height;
      this.rect.left = left;
      this.rect.x = left;
      this.rect.bottom = top + height;
      this.rect.right = left + width;
    }
    onWrapperResize = () => {
      let top;
      let left;
      if (this.options.ignoreSticky) removeParentSticky(this.element);
      if (this.options.ignoreTransform) {
        top = offsetTop(this.element);
        left = offsetLeft(this.element);
      } else {
        const rect = this.element.getBoundingClientRect();
        top = rect.top + scrollTop(this.element);
        left = rect.left + scrollLeft(this.element);
      }
      if (this.options.ignoreSticky) addParentSticky(this.element);
      this.setRect({ top, left });
    };
    onResize = ([entry]) => {
      if (!entry?.borderBoxSize[0]) return;
      const width = entry.borderBoxSize[0].inlineSize;
      const height = entry.borderBoxSize[0].blockSize;
      this.setRect({ width, height });
    };
  };
  var index = 0;
  function uid() {
    return index++;
  }
  var Snap = class {
    constructor(lenis, {
      type = "proximity",
      lerp: lerp2,
      easing,
      duration,
      distanceThreshold = "50%",
      // useless when type is "mandatory"
      debounce: debounceDelay = 500,
      onSnapStart,
      onSnapComplete
    } = {}) {
      this.lenis = lenis;
      this.options = {
        type,
        lerp: lerp2,
        easing,
        duration,
        distanceThreshold,
        debounce: debounceDelay,
        onSnapStart,
        onSnapComplete
      };
      this.onWindowResize();
      window.addEventListener("resize", this.onWindowResize, false);
      this.onSnapDebounced = debounce2(
        this.onSnap,
        this.options.debounce
      );
      this.lenis.on("virtual-scroll", this.onSnapDebounced);
    }
    options;
    elements = /* @__PURE__ */ new Map();
    snaps = /* @__PURE__ */ new Map();
    viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    isStopped = false;
    onSnapDebounced;
    currentSnapIndex;
    /**
     * Destroy the snap instance
     */
    destroy() {
      this.lenis.off("virtual-scroll", this.onSnapDebounced);
      window.removeEventListener("resize", this.onWindowResize, false);
      this.elements.forEach((element) => {
        element.destroy();
      });
    }
    /**
     * Start the snap after it has been stopped
     */
    start() {
      this.isStopped = false;
    }
    /**
     * Stop the snap
     */
    stop() {
      this.isStopped = true;
    }
    /**
     * Add a snap to the snap instance
     *
     * @param value The value to snap to
     * @param userData User data that will be forwarded through the snap event
     * @returns Unsubscribe function
     */
    add(value) {
      const id = uid();
      this.snaps.set(id, { value });
      return () => this.snaps.delete(id);
    }
    /**
     * Add an element to the snap instance
     *
     * @param element The element to add
     * @param options The options for the element
     * @returns Unsubscribe function
     */
    addElement(element, options = {}) {
      const id = uid();
      this.elements.set(id, new SnapElement(element, options));
      return () => this.elements.delete(id);
    }
    addElements(elements, options = {}) {
      const map = [...elements].map(
        (element) => this.addElement(element, options)
      );
      return () => {
        map.forEach((remove) => {
          remove();
        });
      };
    }
    onWindowResize = () => {
      this.viewport.width = window.innerWidth;
      this.viewport.height = window.innerHeight;
    };
    computeSnaps = () => {
      const { isHorizontal } = this.lenis;
      let snaps = [...this.snaps.values()];
      this.elements.forEach(({ rect, align }) => {
        let value;
        align.forEach((align2) => {
          if (align2 === "start") {
            value = rect.top;
          } else if (align2 === "center") {
            value = isHorizontal ? rect.left + rect.width / 2 - this.viewport.width / 2 : rect.top + rect.height / 2 - this.viewport.height / 2;
          } else if (align2 === "end") {
            value = isHorizontal ? rect.left + rect.width - this.viewport.width : rect.top + rect.height - this.viewport.height;
          }
          if (typeof value === "number") {
            snaps.push({ value: Math.ceil(value) });
          }
        });
      });
      snaps = snaps.sort((a, b) => Math.abs(a.value) - Math.abs(b.value));
      return snaps;
    };
    previous() {
      this.goTo((this.currentSnapIndex ?? 0) - 1);
    }
    next() {
      this.goTo((this.currentSnapIndex ?? 0) + 1);
    }
    goTo(index2) {
      const snaps = this.computeSnaps();
      if (snaps.length === 0) return;
      this.currentSnapIndex = Math.max(0, Math.min(index2, snaps.length - 1));
      const currentSnap = snaps[this.currentSnapIndex];
      if (currentSnap === void 0) return;
      this.lenis.scrollTo(currentSnap.value, {
        duration: this.options.duration,
        easing: this.options.easing,
        lerp: this.options.lerp,
        lock: this.options.type === "lock",
        userData: { initiator: "snap" },
        onStart: () => {
          this.options.onSnapStart?.({
            index: this.currentSnapIndex,
            ...currentSnap
          });
        },
        onComplete: () => {
          this.options.onSnapComplete?.({
            index: this.currentSnapIndex,
            ...currentSnap
          });
        }
      });
    }
    get distanceThreshold() {
      let distanceThreshold = Number.POSITIVE_INFINITY;
      if (this.options.type === "mandatory") return Number.POSITIVE_INFINITY;
      const { isHorizontal } = this.lenis;
      const axis = isHorizontal ? "width" : "height";
      if (typeof this.options.distanceThreshold === "string" && this.options.distanceThreshold.endsWith("%")) {
        distanceThreshold = Number(this.options.distanceThreshold.replace("%", "")) / 100 * this.viewport[axis];
      } else if (typeof this.options.distanceThreshold === "number") {
        distanceThreshold = this.options.distanceThreshold;
      } else {
        distanceThreshold = this.viewport[axis];
      }
      return distanceThreshold;
    }
    onSnap = (e) => {
      if (this.isStopped) return;
      if (e.event.type === "touchmove") return;
      if (this.options.type === "lock" && this.lenis.userData?.initiator === "snap")
        return;
      let { scroll, isHorizontal } = this.lenis;
      const delta = isHorizontal ? e.deltaX : e.deltaY;
      scroll = Math.ceil(this.lenis.scroll + delta);
      const snaps = this.computeSnaps();
      if (snaps.length === 0) return;
      let snapIndex;
      const prevSnapIndex = snaps.findLastIndex(({ value }) => value < scroll);
      const nextSnapIndex = snaps.findIndex(({ value }) => value > scroll);
      if (this.options.type === "lock") {
        if (delta > 0) {
          snapIndex = nextSnapIndex;
        } else if (delta < 0) {
          snapIndex = prevSnapIndex;
        }
      } else {
        const prevSnap = snaps[prevSnapIndex];
        const distanceToPrevSnap = prevSnap ? Math.abs(scroll - prevSnap.value) : Number.POSITIVE_INFINITY;
        const nextSnap = snaps[nextSnapIndex];
        const distanceToNextSnap = nextSnap ? Math.abs(scroll - nextSnap.value) : Number.POSITIVE_INFINITY;
        snapIndex = distanceToPrevSnap < distanceToNextSnap ? prevSnapIndex : nextSnapIndex;
      }
      if (snapIndex === void 0) return;
      if (snapIndex === -1) return;
      snapIndex = Math.max(0, Math.min(snapIndex, snaps.length - 1));
      const snap = snaps[snapIndex];
      const distance = Math.abs(scroll - snap.value);
      if (distance <= this.distanceThreshold) {
        this.goTo(snapIndex);
      }
    };
    resize() {
      this.elements.forEach((element) => {
        element.onWrapperResize();
      });
    }
  };

  // src/features/loopSlider.ts
  var LOOP_SLIDER_SELECTORS = {
    root: ['[data-loop-slider="root"]', ".loop-slider-wrapper", ".slider-section"],
    track: ['[data-loop-slider="track"]', ".loop-slider-track"],
    list: ['[data-loop-slider="list"]', ".slider-wrapper"],
    loop: ['[data-loop-slider="loop"]', ".loop-slider.w-dyn-list", ".loop-slider"],
    item: ['[data-loop-slider="item"]', ".slide-w"],
    content: ['[data-loop-slider="content"]', ".home-project-card"],
    blur: ['[data-loop-slider="blur"]', ".slide-blur"],
    media: ['[data-loop-slider="focus"]', ".home-project-card"]
  };
  var LOOP_SLIDER_CONFIG = {
    baseScale: 0.6,
    // reduced to avoid full bleed
    focusScale: 0.825,
    // max scale doesn't reach edges
    blurMax: 100,
    // blur on enter/leave
    translateMax: 0,
    lerp: 0.08,
    // faster snapping
    progressLerp: 0.12,
    minOpacity: 0.7,
    // increased to prevent items looking completely gone
    safeZoneBuffer: -32,
    // negative buffer pulls items into transition earlier
    initialOffset: 0.125,
    // 12.5% of viewport height starting "scrolled up"
    bgBaseScale: 0.7,
    // larger than card's baseScale
    bgFocusScale: 1
    // much larger than card's 0.825 focusScale
  };
  var LENIS_STYLE_ID = "loop-slider-lenis-styles";
  var LENIS_STYLES = "html.lenis,html.lenis body{height:auto}.lenis:not(.lenis-autoToggle).lenis-stopped{overflow:clip}.lenis [data-lenis-prevent],.lenis [data-lenis-prevent-wheel],.lenis [data-lenis-prevent-touch]{overscroll-behavior:contain}.lenis.lenis-smooth iframe{pointer-events:none}.lenis.lenis-autoToggle{transition-property:overflow;transition-duration:1ms;transition-behavior:allow-discrete}";
  var LOOP_SLIDER_SNAP_ATTR = "data-loop-slider-snap";
  var sliderAnimationFrame = null;
  var sliderScrollListenerAttached = false;
  var sliderResizeListenerAttached = false;
  var loopSliderInstances = [];
  var clamp2 = (value, min, max) => Math.max(min, Math.min(max, value));
  var ensureLenisStyles = () => {
    if (!document.getElementById(LENIS_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = LENIS_STYLE_ID;
      style.textContent = LENIS_STYLES;
      document.head.appendChild(style);
    }
  };
  var queryElementWithFallback = (root, selectors) => {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  };
  var queryAllWithFallback = (root, selectors) => {
    for (const selector of selectors) {
      const elements = Array.from(root.querySelectorAll(selector));
      if (elements.length) {
        return elements;
      }
    }
    return [];
  };
  var getLoopSliderRoots = () => {
    const roots = queryAllWithFallback(document, LOOP_SLIDER_SELECTORS.root);
    return roots.filter((root) => queryElementWithFallback(root, LOOP_SLIDER_SELECTORS.list));
  };
  var updateActiveDetailsFromSource = (source) => {
    const targetNormal = document.querySelector(".list-title-normal");
    const targetSuper = document.querySelector(".list-title-super");
    if (!targetNormal || !targetSuper || !source) return false;
    const sourceTitle = source.querySelector(".cms-homepage-title")?.textContent?.trim() || "";
    const sourceSuper = source.querySelector(".cms-homepage-super")?.textContent?.trim() || "";
    if (targetNormal.textContent !== sourceTitle) {
      targetNormal.textContent = sourceTitle;
    }
    if (targetSuper.textContent !== sourceSuper) {
      targetSuper.textContent = sourceSuper;
    }
    const servicesOut = document.querySelector(".activeitem-services-list");
    const visibleLabels = new Set(
      Array.from(servicesOut?.children || []).map((li) => li.textContent?.trim())
    );
    const incomingLabels = new Set(
      Array.from(source.querySelectorAll(".active-services-source-item")).map(
        (item) => item.textContent?.trim() || ""
      )
    );
    let changed = false;
    if (visibleLabels.size !== incomingLabels.size) {
      changed = true;
    } else {
      for (const label of incomingLabels) {
        if (!visibleLabels.has(label)) {
          changed = true;
          break;
        }
      }
    }
    if (changed && servicesOut) {
      servicesOut.innerHTML = "";
      incomingLabels.forEach((label) => {
        if (!label) return;
        const li = document.createElement("li");
        li.className = "activeitem-service-bubble";
        const inner = document.createElement("div");
        inner.textContent = label;
        li.appendChild(inner);
        servicesOut.appendChild(li);
      });
    }
    return true;
  };
  var LoopSliderInstance = class {
    root;
    prefersInfinite;
    config = LOOP_SLIDER_CONFIG;
    slides = [];
    viewportHeight = window.innerHeight || 0;
    primaryList = null;
    loopHeight = 0;
    loopOffset = 0;
    virtualScroll = 0;
    loopIndex = 0;
    previousScroll = null;
    trackElement = null;
    loopLists = [];
    localLenis = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localSnap = null;
    localLenisRaf = null;
    handleLenisScroll;
    virtualScrollHandler;
    mostVisibleSlide = null;
    isAnimatingSnap = false;
    constructor(root) {
      this.root = root;
      this.prefersInfinite = root.dataset.loopSliderInfinite !== "false";
      const track = queryElementWithFallback(root, LOOP_SLIDER_SELECTORS.track);
      const list = queryElementWithFallback(root, LOOP_SLIDER_SELECTORS.list);
      if (!list || !track) {
        throw new Error(
          'Loop slider list not found. Add data-loop-slider="list" to the slider wrapper.'
        );
      }
      this.primaryList = list;
      this.loopHeight = this.primaryList.scrollHeight;
      this.trackElement = track;
      this.prepareLoopLists(track);
      this.primaryList.style.opacity = "0";
      this.primaryList.style.transition = "opacity 0.4s ease-out";
      if (this.prefersInfinite) {
        this.initLocalLenis();
      }
      this.collectSlides();
    }
    destroy() {
      if (this.handleLenisScroll && this.localLenis) {
        this.localLenis.off("scroll", this.handleLenisScroll);
      }
      if (this.virtualScrollHandler && this.localLenis) {
        this.localLenis.off("virtual-scroll", this.virtualScrollHandler);
      }
      if (this.localLenisRaf !== null) {
        window.cancelAnimationFrame(this.localLenisRaf);
        this.localLenisRaf = null;
      }
      this.localSnap?.destroy();
      this.localSnap = null;
      this.localLenis?.destroy();
      this.localLenis = null;
    }
    applyInitialOffset() {
      if (!this.localLenis) return;
      requestAnimationFrame(() => {
        const offset = this.viewportHeight * this.config.initialOffset;
        if (offset > 0 && this.localLenis) {
          this.localLenis.scrollTo(-offset, { immediate: true });
        }
        requestAnimationFrame(() => {
          if (this.primaryList) {
            this.primaryList.style.opacity = "1";
          }
        });
      });
    }
    initLocalLenis() {
      if (this.localLenis || !this.trackElement) {
        return;
      }
      ensureLenisStyles();
      this.root.style.overflow = this.root.style.overflow || "hidden";
      this.root.style.position = this.root.style.position || "relative";
      this.trackElement.style.willChange = this.trackElement.style.willChange || "transform";
      this.localLenis = new Lenis({
        wrapper: this.root,
        content: this.trackElement,
        smoothWheel: true,
        infinite: true,
        syncTouch: true,
        touchMultiplier: 1.5,
        // Moderated from 2.0 to prevent flying too far
        wheelMultiplier: 1.2
        // Moderated from 1.5
      });
      this.handleLenisScroll = () => {
        this.measure();
      };
      this.localLenis.on("scroll", this.handleLenisScroll);
      this.localSnap = new Snap(this.localLenis, {
        type: "mandatory",
        duration: 0.6,
        easing: (t) => 1 - Math.pow(1 - t, 3)
        // Cubic ease-out
      });
      this.slides.forEach((slide) => {
        this.localSnap?.addElement(slide.node, { align: "center" });
      });
      const raf = (time) => {
        this.localLenis?.raf(time);
        this.localLenisRaf = window.requestAnimationFrame(raf);
      };
      this.localLenisRaf = window.requestAnimationFrame(raf);
    }
    collectSlides() {
      const nodes = queryAllWithFallback(this.root, LOOP_SLIDER_SELECTORS.item);
      this.slides = nodes.map((node) => ({
        node,
        contentNode: queryElementWithFallback(node, LOOP_SLIDER_SELECTORS.content) ?? node,
        bgObjectNode: node.querySelector(".bg-object"),
        blurNode: queryElementWithFallback(node, LOOP_SLIDER_SELECTORS.blur),
        focusNodes: (() => {
          const focusTargets = [];
          const primaryFocus = queryElementWithFallback(
            node,
            LOOP_SLIDER_SELECTORS.media
          );
          const titleNode = node.querySelector(".work-title");
          if (primaryFocus) {
            focusTargets.push(primaryFocus);
          }
          if (titleNode) {
            focusTargets.push(titleNode);
          }
          if (!focusTargets.length) {
            focusTargets.push(
              queryElementWithFallback(node, LOOP_SLIDER_SELECTORS.content) ?? node
            );
          }
          return focusTargets;
        })(),
        progress: 0,
        targetProgress: 0,
        scale: this.config.baseScale,
        targetScale: this.config.baseScale
      }));
      this.slides.forEach((slide) => {
        const content = slide.contentNode;
        content.style.willChange = "transform, opacity, filter, mix-blend-mode";
        content.style.transformOrigin = "center center";
        content.style.position = content.style.position || "relative";
        if (slide.bgObjectNode) {
          slide.bgObjectNode.style.willChange = "transform";
          slide.bgObjectNode.style.transformOrigin = "center center";
        }
      });
    }
    applySlideStyles(slide) {
      const opacity = this.config.minOpacity + (1 - this.config.minOpacity) * slide.progress;
      slide.contentNode.style.transform = `scale(${slide.scale.toFixed(4)})`;
      slide.contentNode.style.opacity = opacity.toFixed(3);
      if (slide.bgObjectNode) {
        const bgScale = this.config.bgBaseScale + (this.config.bgFocusScale - this.config.bgBaseScale) * slide.progress;
        slide.bgObjectNode.style.transform = `scale(${bgScale.toFixed(4)})`;
      }
      const shadowOpacity = slide.progress * 0.4;
      slide.contentNode.style.boxShadow = `0px 20px 120px 20px rgba(0, 0, 0, ${shadowOpacity.toFixed(3)})`;
      slide.focusNodes.forEach((target) => {
        const visibility = slide.progress;
        const blurValue = (1 - visibility) * this.config.blurMax;
        const xRayIntensity = (1 - visibility) * 100;
        target.style.filter = `blur(${blurValue.toFixed(2)}px) grayscale(${xRayIntensity.toFixed(1)}%) invert(${xRayIntensity.toFixed(1)}%)`;
      });
      if (slide.blurNode) {
        slide.blurNode.style.opacity = (1 - slide.progress).toFixed(3);
      }
    }
    prepareLoopLists(track) {
      this.loopLists = queryAllWithFallback(track, LOOP_SLIDER_SELECTORS.loop);
      if (!this.loopLists.length) {
        this.loopLists = [];
        return;
      }
      if (this.loopLists.length < 2) {
        const clone = this.loopLists[0].cloneNode(true);
        track.appendChild(clone);
        this.loopLists.push(clone);
      }
    }
    rotateLists(direction) {
      if (!this.trackElement || !this.loopLists.length) {
        return;
      }
      if (direction === "forward") {
        const first = this.loopLists.shift();
        if (!first) {
          return;
        }
        this.trackElement.appendChild(first);
        this.loopLists.push(first);
      } else {
        const last = this.loopLists.pop();
        if (!last) {
          return;
        }
        const firstChild = this.trackElement.firstElementChild;
        if (firstChild) {
          this.trackElement.insertBefore(last, firstChild);
        } else {
          this.trackElement.appendChild(last);
        }
        this.loopLists.unshift(last);
      }
    }
    computeLoopHeight() {
      if (!this.primaryList) {
        return this.loopHeight;
      }
      const height = this.primaryList.scrollHeight || this.primaryList.offsetHeight;
      if (height) {
        this.loopHeight = height;
      }
      return this.loopHeight;
    }
    applyLoopOffset() {
      if (!this.prefersInfinite || !this.localLenis || !this.trackElement) {
        return;
      }
      const loopHeight = this.loopHeight || this.computeLoopHeight();
      if (!loopHeight) {
        return;
      }
      const { scroll } = this.localLenis;
      const limit = Math.max(this.localLenis.limit || loopHeight, loopHeight);
      if (this.previousScroll === null) {
        this.previousScroll = scroll;
        this.virtualScroll = 0;
        this.loopIndex = 0;
        this.loopOffset = 0;
        this.trackElement.style.transform = "";
        return;
      }
      let delta = scroll - this.previousScroll;
      if (Math.abs(delta) > limit * 0.5) {
        delta += delta > 0 ? -limit : limit;
      }
      this.virtualScroll += delta;
      this.previousScroll = scroll;
      const nextLoopIndex = Math.floor(this.virtualScroll / loopHeight);
      let diff = nextLoopIndex - this.loopIndex;
      while (diff > 0) {
        this.rotateLists("forward");
        this.loopIndex += 1;
        diff -= 1;
      }
      while (diff < 0) {
        this.rotateLists("backward");
        this.loopIndex -= 1;
        diff += 1;
      }
      const remainder = this.virtualScroll - this.loopIndex * loopHeight;
      this.loopOffset = scroll - remainder;
      this.trackElement.style.transform = `translate3d(0, ${this.loopOffset}px, 0)`;
    }
    measure() {
      if (!this.slides.length) {
        return;
      }
      const viewportHeight = Math.max(window.innerHeight, 1);
      this.viewportHeight = viewportHeight;
      this.computeLoopHeight();
      this.applyLoopOffset();
      const buffer = this.config.safeZoneBuffer;
      let maxVisibility = -1;
      let nextActiveSlide = null;
      this.slides.forEach((slide) => {
        const scaleRect = slide.node.getBoundingClientRect();
        const nodeCenter = scaleRect.top + scaleRect.height / 2;
        const viewportCenter = viewportHeight / 2;
        const distance = Math.abs(nodeCenter - viewportCenter);
        const plateau = Math.max(0, (scaleRect.height - viewportHeight) / 2);
        const activeDistance = Math.max(0, distance - plateau);
        const transitionDist = viewportHeight / 2 + buffer - 1;
        let scaleVisibility = 1 - activeDistance / transitionDist;
        scaleVisibility = clamp2(scaleVisibility * 2.5, 0, 1);
        scaleVisibility = Math.pow(scaleVisibility, 0.3);
        slide.targetProgress = scaleVisibility;
        slide.targetScale = this.config.baseScale + (this.config.focusScale - this.config.baseScale) * scaleVisibility;
        if (scaleVisibility > maxVisibility) {
          maxVisibility = scaleVisibility;
          nextActiveSlide = slide;
        }
      });
      if (nextActiveSlide && nextActiveSlide !== this.mostVisibleSlide && maxVisibility > 0.5) {
        this.mostVisibleSlide = nextActiveSlide;
        const source = this.mostVisibleSlide.node.querySelector(".cms-homepage-source");
        if (source) {
          updateActiveDetailsFromSource(source);
        }
      }
    }
    animate() {
      if (!this.slides.length) {
        return;
      }
      this.slides.forEach((slide) => {
        slide.scale += (slide.targetScale - slide.scale) * this.config.lerp;
        slide.progress += (slide.targetProgress - slide.progress) * this.config.progressLerp;
        this.applySlideStyles(slide);
      });
    }
    syncToTargets() {
      if (!this.slides.length) {
        return;
      }
      this.slides.forEach((slide) => {
        slide.scale = slide.targetScale;
        slide.progress = slide.targetProgress;
        this.applySlideStyles(slide);
      });
    }
  };
  var triggerSliderMeasurements = () => {
    loopSliderInstances.forEach((instance) => instance.measure());
  };
  var handleNativeScroll = () => {
    triggerSliderMeasurements();
  };
  var handleResize = () => {
    triggerSliderMeasurements();
  };
  var attachNativeScrollListener = () => {
    if (sliderScrollListenerAttached) {
      return;
    }
    window.addEventListener("scroll", handleNativeScroll, { passive: true });
    sliderScrollListenerAttached = true;
  };
  var attachResizeListener = () => {
    if (sliderResizeListenerAttached) {
      return;
    }
    window.addEventListener("resize", handleResize);
    sliderResizeListenerAttached = true;
  };
  var startSliderAnimationLoop = () => {
    if (sliderAnimationFrame !== null) {
      return;
    }
    const loop = () => {
      loopSliderInstances.forEach((instance) => instance.animate());
      sliderAnimationFrame = window.requestAnimationFrame(loop);
    };
    sliderAnimationFrame = window.requestAnimationFrame(loop);
  };
  var initLoopSlider = () => {
    const shouldSnap = document.body.hasAttribute(LOOP_SLIDER_SNAP_ATTR);
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const sliderRoots = getLoopSliderRoots();
    if (!sliderRoots.length) {
      if (shouldSnap) {
        document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
      }
      return;
    }
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReducedMotion.matches) {
      if (shouldSnap) {
        document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
      }
      return;
    }
    const instances = sliderRoots.map((root) => {
      try {
        return new LoopSliderInstance(root);
      } catch {
        return null;
      }
    }).filter((instance) => Boolean(instance));
    if (!instances.length) {
      return;
    }
    loopSliderInstances.push(...instances);
    attachNativeScrollListener();
    attachResizeListener();
    triggerSliderMeasurements();
    if (shouldSnap) {
      instances.forEach((instance) => instance.syncToTargets());
      document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
    }
    instances.forEach((instance) => instance.applyInitialOffset());
    startSliderAnimationLoop();
  };

  // src/index.ts
  window.Webflow ||= [];
  window.Webflow.push(() => {
    const name = "John Doe";
    greetUser(name);
    initLoopSlider();
  });
})();
//# sourceMappingURL=index.js.map
