"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionState, reduceSessionState } = require("../js/session-state.js");

test("session state starts checking and resolves authenticated", () => {
  const state = reduceSessionState(createSessionState(), { type: "probe", authenticated: true });
  assert.equal(state.status, "authenticated");
});

test("session state shows required only when the probe says login is required", () => {
  const state = reduceSessionState(createSessionState(), { type: "probe", authenticated: false, required: true });
  assert.equal(state.status, "required");
});

test("successful post-login probe clears the required state", () => {
  const required = reduceSessionState(createSessionState(), { type: "probe", authenticated: false, required: true });
  const authenticated = reduceSessionState(required, { type: "probe", authenticated: true });
  assert.equal(authenticated.status, "authenticated");
  assert.equal(authenticated.showLogin, false);
});
