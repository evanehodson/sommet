let _mile = null;
const _listeners = new Set();

export function getMile() {
    return _mile;
}

export function setMile(mile, source) {
    if (_mile === mile && mile !== null) return;
    _mile = mile;
    for (const fn of _listeners) fn(mile, source);
}

export function onMileChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
