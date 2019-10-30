import { h, Component, ComponentType } from 'preact';
import { IroColor, IroColorValue, IroColorPickerOptions, iroColorPickerOptionDefaults } from '@irojs/iro-core';

import { IroWheel } from './Wheel';
import { IroSlider } from './Slider';
import { createWidget } from './createWidget';
import { EventResult } from './ComponentBase'

interface ColorPickerEvents {
  [key: string]: Function[];
}

interface ColorDeferredEvents {
  [key: string]: Array<any>;
}

interface ColorPickerLayoutDefinition {
  component: ComponentType;
  options: any;
}

export interface ColorPickerProps extends IroColorPickerOptions {
  display?: string;
  id?: null;
  layout?: ColorPickerLayoutDefinition[];
}

export interface ColorPickerState extends ColorPickerProps {
  color: IroColor;
}

export class IroColorPicker extends Component<ColorPickerProps, ColorPickerState> {

  public static pluginHooks = {};
  public static defaultProps = {
    ...iroColorPickerOptionDefaults,
    display: 'block',
    id: null,
    layout: null
  }

  public el: HTMLElement;
  public id: string;
  public defaultColor: IroColorValue;
  public color: IroColor;
  public inputActive: boolean = false;

  private events: ColorPickerEvents = {};
  private deferredEvents: ColorDeferredEvents = {};
  private colorUpdateActive: boolean = false;

  constructor(props) {
    super(props);
    this.emitHook('init:before');
    this.id = props.id;
    this.defaultColor = props.color;
    // Whenever the color changes, update the color wheel
    this.color = new IroColor(props.color, this.onColorChange.bind(this));
    this.deferredEmit('color:init', this.color);
    // Pass all the props into the component's state,
    // Except we want to add the color object and make sure that refs aren't passed down to children
    this.state = {
      ...props,
      ref: undefined,
      color: this.color,
      layout: props.layout !== null ? props.layout : [
        // default layout is just a wheel and a slider
        {component: IroWheel, options: {}},
        {component: IroSlider, options: {}},
      ]
    };
    this.emitHook('init:state');
    this.emitHook('init:after');
  }

  // Public ColorPicker events API

  /**
   * @desc Set a callback function for an event
   * @param eventList event(s) to listen to
   * @param callback - Function called when the event is fired
   */
  public on(eventList: string[] | string, callback: Function) {
    const events = this.events;
    // eventList can be an eventType string or an array of eventType strings
    (!Array.isArray(eventList) ? [eventList] : eventList).forEach(eventType => {
      // Emit plugin hook
      this.emitHook('event:on', eventType, callback);
      // Add event callback
      (events[eventType] || (events[eventType] = [])).push(callback);
      // Call deferred events
      // These are events that can be stored until a listener for them is added
      if (this.deferredEvents[eventType]) {
        // Deffered events store an array of arguments from when the event was called
        this.deferredEvents[eventType].forEach(args => {
          callback.apply(null, args); 
        });
        // Clear deferred events
        this.deferredEvents[eventType] = [];
      }
    });
  }

  /**
   * @desc Remove a callback function for an event added with on()
   * @param eventList - event(s) to listen to
   * @param callback - original callback function to remove
   */
  public off(eventList: string[] | string, callback: Function) {
    (!Array.isArray(eventList) ? [eventList] : eventList).forEach(eventType => {
      const callbackList = this.events[eventType];
      this.emitHook('event:off', eventType, callback);
      if (callbackList) callbackList.splice(callbackList.indexOf(callback), 1);
    });
  }

  /**
   * @desc Emit an event
   * @param eventType event to emit
   */
  public emit(eventType: string, ...args: any) {
    // Events are plugin hooks too
    this.emitHook(eventType, ...args);
    const callbackList = this.events[eventType] || [];
    for (let i = 0; i < callbackList.length; i++) {
      callbackList[i].apply(this, args); 
    }
  }

  /**
   * @desc Emit an event now, or save it for when the relevent event listener is added
   * @param eventType - The name of the event to emit
   */
  public deferredEmit(eventType: string, ...args: any) {
    const deferredEvents = this.deferredEvents;
    this.emit(eventType, ...args);
    (deferredEvents[eventType] || (deferredEvents[eventType] = [])).push(args);
  }

  // Public utility methods

  public updateOptions(newOptions: Partial<ColorPickerState>) {
    this.setState({ ...this.state, ...newOptions });
  }

  /**
   * @desc Resize the color picker
   * @param width - new width
   */
  public resize(width: number) {
    this.updateOptions({ width })
  }

  /**
   * @desc Reset the color picker to the initial color provided in the color picker options
   */
  public reset() {
    this.color.set(this.defaultColor);
  }

  // Plugin hooks API

  /**
   * @desc Set a callback function for a hook
   * @param hookType - The name of the hook to listen to
   * @param callback
   */
  public static addHook(hookType: string, callback: Function) {
    const pluginHooks = IroColorPicker.pluginHooks;
    (pluginHooks[hookType] || (pluginHooks[hookType] = [])).push(callback);
  }

  /**
   * @desc Emit a callback hook
   * @param hookType - The type of hook event to emit
   */
  private emitHook(hookType: string, ...args: any) {
    const callbackList = IroColorPicker.pluginHooks[hookType] || [];
    for (let i = 0; i < callbackList.length; i++) {
      callbackList[i].apply(this, args); 
    }
  }

  /**
   * @desc Called by the createWidget wrapper when the element is mounted into the page
   * @param container - the container element for this ColorPicker instance
   */
  public onMount(container: HTMLElement) {
    this.el = container;
    this.deferredEmit('mount', this);
  }

  // Internal methods

  /**
   * @desc React to a color update
   * @param color - current color
   * @param changes - shows which h,s,v,a color channels changed
   */
  private onColorChange(color: IroColor, changes: any) {
    this.emitHook('color:beforeUpdate', color, changes);
    this.setState({ color });
    this.emitHook('color:afterUpdate', color, changes);
    // Prevent infinite loops if the color is set inside a color:change or input:change callback
    if (!this.colorUpdateActive) {
      // While _colorUpdateActive == true, branch cannot be entered
      this.colorUpdateActive = true;
      // If the color change originates from user input, fire input:change
      if (this.inputActive) {
        this.inputActive = false;
        this.emit('input:change', color, changes);
      } 
      // Always fire color:change event
      this.emit('color:change', color, changes);
      this.colorUpdateActive = false;
    }
  }

  /**
   * @desc Handle input from a UI control element
   * @param type - event type
   */
  private handleInput(type: EventResult) {
    if (type === EventResult.start) this.emit('input:start', this.color);
    if (type === EventResult.move) this.emit('input:move', this.color);
    if (type === EventResult.end) this.emit('input:end', this.color);
  }

  public render(props, state) {
    return (
      <div 
        class="IroColorPicker"
        id={ state.id }
        style={{
          display: state.display,
          [props.layoutDirection === 'vertical' ? 'width' : 'height']: state.width
        }}
      >
        { state.layout.map(({component: UiComponent, options: options}) => (
          <UiComponent
            {...state}
            {...options}
            onInput={ this.handleInput.bind(this) }
            parent={ this }
          />
        ))}
      </div>
    )
  }
}

export const IroColorPickerWidget = createWidget(IroColorPicker);