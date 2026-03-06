/**
 * PlaybackState — observable bag of all active-session display values.
 *
 * This is the single source of truth for what the play pane and its child
 * visualizers should show at any moment.  Providers call `update(patch)`;
 * consumers call `subscribe(fn)` and receive the full state immediately and
 * on every subsequent change.
 *
 * PlaybackContext — context token used to pass a PlaybackState instance from
 * a pane (plan-play-pane or plan-edit-pane) down to its descendant visualizers
 * (plan-visualizer, timeline-visualization) via the WCCG context protocol.
 */

import { createContext } from "../base/context.js";

/**
 * Context token.  Import the same reference in provider and consumer.
 * @type {import('../base/context.js').Context<PlaybackState|null>}
 */
export const PlaybackContext = createContext("playback", null);

/**
 * @typedef {{
 *   scores: number[],
 *   highlight: number,
 *   overallScore: number,
 *   status: string,
 *   beat: { beatNum: number, isDownbeat: boolean, shouldShow: boolean } | null,
 *   isPlaying: boolean,
 * }} PlaybackSnapshot
 */

export class PlaybackState {
  constructor() {
    /** @type {PlaybackSnapshot} */
    this._state = {
      scores: [],
      highlight: -1,
      overallScore: 0,
      status: "",
      beat: null,
      isPlaying: false,
    };
    /** @type {Set<(state: PlaybackSnapshot) => void>} */
    this._subscribers = new Set();
  }

  /** @returns {PlaybackSnapshot} */
  get state() {
    return this._state;
  }

  /**
   * Subscribe to state changes.  fn is called immediately with the current
   * state and again on every update.
   * @param {(state: PlaybackSnapshot) => void} fn
   * @returns {() => void} Unsubscribe function
   */
  subscribe(fn) {
    this._subscribers.add(fn);
    fn(this._state);
    return () => this._subscribers.delete(fn);
  }

  /**
   * Merge patch into the state and notify all subscribers.
   * @param {Partial<PlaybackSnapshot>} patch
   */
  update(patch) {
    this._state = { ...this._state, ...patch };
    for (const fn of this._subscribers) {
      fn(this._state);
    }
  }
}
