A component is how the DOM is manipulated

## Naming

files named `*.component.js` have one default export which is a component
component classes are named `DDDDComponent`

## Lifecycle

1. When imported in `main.js` the web component is registered
2. onMount looks up dom elements and creates event callbacks
3. The component recieves events if it is mounted, and runs methods that update the dom, and accesses services
4. onMount fires, cleanup is run, and references are removed

## Context

Context forms the relationships between components and services

## Root context

- The root context catches all unhandled context requests.
- It is the primary way that components get access to global services

## State

Components can be state machines if they follow the conventions of `state.md`

## DOM

Components have a typed `dom` property which is initialized to `{}`. This is the ONLY way they can access elements.

Elements are almost always typed to be `SomeTimeOfElement` so that we don't consider if they are undefined

It contains either direct references to elements, or functions that perform query selectors

`onMount` populates it, and `onUnmount` erases it. This means that any attempt to access the DOM fails if code runs while unmounted
