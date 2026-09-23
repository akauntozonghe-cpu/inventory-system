"use client";
import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type Ref } from "react";
type Props = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
/** Preserve the DOM-owned Japanese composition buffer during surrounding updates. */
export default function ImeInput({ value, defaultValue, onChange, onCompositionStart, onCompositionEnd, onKeyDown, ref, ...props }: Props) {
  const element = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);
  const text = !props.type || ["text", "search", "email", "tel", "url", "password"].includes(props.type);
  useLayoutEffect(() => {
    if (text && !composing.current && element.current && value !== undefined) {
      const next = String(value);
      if (element.current.value !== next) element.current.value = next;
    }
  });
  if (!text) return <input {...props} value={value} defaultValue={defaultValue} onChange={onChange} onKeyDown={onKeyDown} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd} ref={ref}/>;
  return <input {...props} defaultValue={value ?? defaultValue} ref={node => {
    element.current = node;
    if (typeof ref === "function") return ref(node);
    if (ref) ref.current = node;
  }} onKeyDown={event => {
    if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault(); event.stopPropagation(); return;
    }
    onKeyDown?.(event);
  }} onCompositionStart={event => { composing.current = true; onCompositionStart?.(event); }}
  onCompositionEnd={event => {
    composing.current = false;
    onCompositionEnd?.(event);
    onChange?.(event as unknown as ChangeEvent<HTMLInputElement>);
  }} onChange={event => {
    if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) onChange?.(event);
  }}/>;
}
