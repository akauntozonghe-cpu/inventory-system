let dirty = false;
export function setUnsavedWork(value: boolean) { dirty = value; }
export function hasUnsavedWork() { return dirty; }
