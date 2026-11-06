"use strict";

function createSessionState() {
  return { status: "checking", showLogin: false, message: "Checking Pinterest session…" };
}

function reduceSessionState(state, event) {
  const current = state || createSessionState();
  if (!event || event.type !== "probe") return current;
  if (event.authenticated === true) {
    return { status: "authenticated", showLogin: false, message: "" };
  }
  if (event.required === true) {
    return { status: "required", showLogin: true, message: "Sign in to Pinterest to search and save Pins." };
  }
  return { status: "checking", showLogin: false, message: "Checking Pinterest session…" };
}

module.exports = { createSessionState, reduceSessionState };
