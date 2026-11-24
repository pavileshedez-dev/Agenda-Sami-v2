import { useCallback, useEffect, useRef, useState } from 'react'

const WRITE_DELAY = 200

function readValue(key, initialValue) {
    try {
        const item = window.localStorage.getItem(key)
        return item ? JSON.parse(item) : initialValue
    } catch (error) {
        console.warn(`Error reading localStorage key "${key}":`, error)
        return initialValue
    }
}

function writeValue(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
        return true
    } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error)
        return false
    }
}

export function useLocalStorage(key, initialValue) {
    const [storedValue, setState] = useState(() => readValue(key, initialValue))
    const valueRef = useRef(storedValue)
    const timerRef = useRef(null)
    const dirtyRef = useRef(false)

    const setStoredValue = useCallback(valueOrUpdater => {
        const nextValue = typeof valueOrUpdater === 'function'
            ? valueOrUpdater(valueRef.current)
            : valueOrUpdater
        valueRef.current = nextValue
        dirtyRef.current = true
        setState(nextValue)
    }, [])

    useEffect(() => {
        if (!dirtyRef.current) return undefined

        timerRef.current = window.setTimeout(() => {
            if (writeValue(key, valueRef.current)) dirtyRef.current = false
            timerRef.current = null
        }, WRITE_DELAY)

        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current)
                timerRef.current = null
            }
        }
    }, [key, storedValue])

    useEffect(() => {
        function flush() {
            if (!dirtyRef.current) return
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current)
                timerRef.current = null
            }
            if (writeValue(key, valueRef.current)) dirtyRef.current = false
        }

        window.addEventListener('pagehide', flush)
        return () => {
            window.removeEventListener('pagehide', flush)
            flush()
        }
    }, [key])

    return [storedValue, setStoredValue]
}
