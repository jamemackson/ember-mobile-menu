import Component from '@ember/component';
import layout from '../templates/components/mobile-menu';

import { computed } from '@ember/object';
import { or } from '@ember/object/computed';
import { getOwner } from '@ember/application';

import ComponentChildMixin from 'ember-mobile-menu/mixins/component-child';
import RecognizerMixin from 'ember-mobile-core/mixins/pan-recognizer';
import getWindowWidth from 'ember-mobile-core/utils/get-window-width';
import Tween from 'ember-mobile-core/tween';
import { task } from 'ember-concurrency';
import withTestWaiter from 'ember-concurrency-test-waiter/with-test-waiter';
import normalizeCoordinates from '../utils/normalize-coordinates';

/**
 * Menu component
 *
 * @class MobileMenu
 * @public
 */
export default Component.extend(ComponentChildMixin, RecognizerMixin, {
  layout,

  classNames: ['mobile-menu'],
  classNameBindings: [
    'isLeft:mobile-menu--left',
    'isRight:mobile-menu--right',
    'isDragging:mobile-menu--dragging',
    'isOpen:mobile-menu--open',
    'isTransitioning:mobile-menu--transitioning',
    'shadowEnabled:mobile-menu--shadow'
  ],

  /**
   * The type of menu. Currently 'left' and 'right' are supported.
   *
   * @argument type
   * @type String
   * @default 'left'
   */
  type:           'left', // 'left' or 'right'

  /**
   * The percentage of the screen the menu will take when opened.
   *
   * @argument width
   * @type Number [0-100]
   * @default 85
   */
  width:          85,     // 0-100

  /**
   * The maximum width of the menu in pixels.
   *
   * @argument maxWidth
   * @type Number
   * @default 300
   */
  maxWidth:       300,    // in px

  /**
   * Whether or not a mask is added when the menu is opened.
   *
   * @argument maskEnabled
   * @type Boolean
   * @default true
   */
  maskEnabled:    true,

  /**
   * Whether or not a shadow is added to the menu.
   *
   * @argument shadowEnabled
   * @type Boolean
   * @default true
   */
  shadowEnabled:  true,

  /**
   * The default swipe velocity needed to fully open the menu.
   *
   * @argument triggerVelocity
   * @type Number
   * @default 0.3
   */
  triggerVelocity: 0.3,

  /**
   * @property embed
   * @type boolean
   * @default false
   * @protected
   */
  embed: false,

  /**
   * Hook fired when the menu is opened. You can pass in an action. The menu instance will be passed to the action.
   *
   * @argument onOpen
   * @type Function
   * @protected
   */
  onOpen(){},

  /**
   * Hook fired when the menu is closed. You can pass in an action. The menu instance will be passed to the action.
   *
   * @property onClose
   * @type Action
   * @protected
   */
  onClose(){},

  /**
   * @property isDragging
   * @type boolean
   * @default false
   * @private
   */
  isDragging: false,

  /**
   * @property position
   * @type number
   * @default 0
   * @private
   */
  position:  0,

  /**
   * @property dxCorrection
   * @type number
   * @default 0
   * @private
   */
  dxCorrection: 0,

  isLeft: computed('type', function(){
    return this.get('type') === 'left';
  }),
  isRight: computed('type', function(){
    return this.get('type') === 'right';
  }),
  isOpen: computed('isDragging', 'position', '_width', 'isLeft', function(){
    return !this.get('isDragging') && this.get('position') === this.get('_width');
  }),
  isTransitioning: or('open.isRunning', 'close.isRunning'),
  relativePosition: computed('position', function(){
    return Math.abs(this.get('position')) / this.get('_width');
  }),

  fastboot: computed(function() {
    const owner = getOwner(this);
    return owner.lookup('service:fastboot');
  }),
  isFastBoot: computed('fastboot', function(){
    return !!this.get('fastboot.isFastBoot');
  }),

  /**
   * Current menu width in px
   *
   * @property _width
   * @return {Boolean}
   * @private
   */
  _width: computed('width', 'maxWidth', function(){
    return this.get('isFastBoot')
      ? this.get('maxWidth')
      : Math.min(this.get('width') / 100 * getWindowWidth(), this.get('maxWidth'));
  }),

  open: withTestWaiter(task(function * (){
    const startPos = this.get('position');
    const diff = this.get('_width') - startPos;

    const anim = new Tween((progress) => {
      this.set('position', startPos + diff * progress);
    }, { duration: 300});
    yield anim.start();

    this.get('onOpen')(this);
  }).restartable()),

  close: withTestWaiter(task(function * (){
    const startPos = this.get('position');

    const anim = new Tween((progress) => {
      this.set('position', startPos * (1 - progress));
    }, { duration: 300});
    yield anim.start();

    this.get('onClose')();
  }).restartable()),

  actions: {
    open(){
      this.get('open').perform();
    },
    close(){
      this.get('close').perform();
    }
  },

  // pan handlers for opening the menu
  panOpen(e){
    this.set('isDragging', true);

    const _e = this.get('embed') ? normalizeCoordinates(e, this.element) : e;
    const {
      current: {
        distanceX
      }
    } = _e;

    const dx = this.get('isLeft') ? distanceX : -distanceX;
    const width = this.get('_width');

    // enforce limits on the offset [0, width]
    const targetPosition = Math.min(Math.max(dx, 0), width);

    this.set('position', targetPosition);
  },
  panOpenEnd(e){
    this.set('isDragging', false);

    const _e = this.get('embed') ? normalizeCoordinates(e, this.element) : e;
    const {
      current: {
        distanceX,
        velocityX,
      }
    } = _e;

    const triggerVelocity = this.get('triggerVelocity');

    const isLeft = this.get('isLeft');
    const width = this.get('_width');

    const dx = isLeft ? distanceX : -distanceX;
    const vx = isLeft ? velocityX : -velocityX;

    // when overall horizontal velocity is high, force open/close and skip the rest
    if (vx > triggerVelocity || dx > width / 2) {
      this.get('open').perform();
    } else {
      this.get('close').perform();
    }
  },

  // pan handlers for closing the menu
  didPan(e){
    const _e = this.get('embed') ? normalizeCoordinates(e, this.element) : e;
    const {
      current: {
        distanceX,
        x
      }
    } = _e;

    const isLeft = this.get('isLeft');
    const windowWidth = getWindowWidth();
    const width = this.get('_width');

    const dx = isLeft ? distanceX : -distanceX;
    const cx = isLeft ? x : windowWidth - x;

    if(this.get('isOpen') && !this.get('isDragging')){
      // calculate and set a correction delta if the pan started outside the opened menu
      if(cx < width) {
        this.set('isDragging', true);
        this.set('dxCorrection', dx);
      }
    }

    if(this.get('isDragging')){
      let targetPosition = dx;

      // correct targetPosition with dxCorrection set earlier
      targetPosition -= this.get('dxCorrection');

      // enforce limits on the offset [0, width]
      if(cx < width){
        if(targetPosition > 0){
          targetPosition = 0;
        } else if(targetPosition < -1 * width){
          targetPosition = -1 * width;
        }
        this.set('position', width + targetPosition);
      }
    }
  },
  didPanEnd(e){
    if(this.get('isDragging')){
      this.set('isDragging', false);

      const _e = this.get('embed') ? normalizeCoordinates(e, this.element) : e;
      const {
        current: {
          distanceX,
          velocityX
        }
      } = _e;

      const triggerVelocity = this.get('triggerVelocity');

      const isLeft = this.get('isLeft');
      const width = this.get('_width');

      const dx = isLeft ? distanceX : -distanceX;
      const vx = isLeft ? velocityX : -velocityX;

      // the pan action is over, cleanup and set the correct final menu position
      if (vx < -1 * triggerVelocity || -1 * dx > width / 2){
        this.get('close').perform();
      } else {
        this.get('open').perform();
      }

      this.set('dxCorrection', 0);
    }
  }
});
