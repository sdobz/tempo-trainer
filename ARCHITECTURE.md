## Intent

Organizing semantics such that agents can efficiently implement features

When a feature is implemented it should modify the fewest reasonable files, and understanding files should require minimal context windows.

## Semantic Gradient

There are a few highly abstract semantics that describe the behavior and goals of an implementation:

Using a microphone to detect and score the timing of drum beats in order to teach drumming skills

- microphone
- detect
- score
- timing
- drum
- beat
- teach
- skills

at the high level they describe features.

As we progress down the gradient we get more and more specific, from coordination code to actual description of business logic to state management and the implementation of browser APIs.

## Feature

A distinct and observable part of the software

- microphone selection
- plan visualization

Features are described by a hierarchy of modules.

## Module

A module is a namespaced group of code.

## Wiring Layer

Features depend on the host environment and each other. Wiring layers exist to connect features together.

Wiring layers serve as maps for data flow and implement the bare minimum of features

## Complexity

Relationships build the largest burden of complexity. If we imagine wiring layers as broad thin horizontal pancakes each feature is a pillar holding it up, with connections going up into the wiring layer and back down into other features.

Minimizing these connections is the goal of feature based organization. Each piece of code should be placed in a place that minimizes number and length of connections.
