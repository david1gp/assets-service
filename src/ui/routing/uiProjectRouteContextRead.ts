import { useContext } from "solid-js"
import { uiProjectRouteContext } from "./uiProjectRouteContext.js"

/** Reads the resolved project route context supplied by a project route guard. */
export const uiProjectRouteContextRead = () => useContext(uiProjectRouteContext)
