"use strict";

// Task 1 scaffold: keep the window usable without starting Pinterest behavior.
const searchForm = document.getElementById("searchForm");
const searchButton = document.getElementById("searchButton");
const importStatus = document.getElementById("importStatus");
const settingsButton = document.getElementById("settingsButton");

if (searchForm && searchForm.tagName === "FORM") {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (importStatus) {
      importStatus.textContent = "Search is not available yet.";
    }
  });
}

if (searchButton && searchButton.tagName === "BUTTON") {
  searchButton.setAttribute("disabled", "");
  searchButton.title = "Search will be available in a future update.";
}

if (settingsButton && settingsButton.tagName === "BUTTON") {
  settingsButton.setAttribute("disabled", "");
  settingsButton.title = "Settings will be available in a future update.";
}
