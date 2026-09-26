/*
 * content-script-profiles.js
 *
 * One package, two runtime profiles:
 * - Chromium keeps the V14 eager/static-equivalent content-script timing.
 * - Firefox uses the V15 minimal first-paint + lazy feature-loader profile.
 *
 * Profiles are registered once with chrome.scripting.registerContentScripts()
 * and persist across normal browser restarts.
 */
(() => {
  "use strict";
  if (globalThis.DCBContentScriptProfiles) return;

  globalThis.DCBContentScriptProfiles = Object.freeze({
    version: 2,
    chrome: Object.freeze([
    {
        "id": "dcb-profile-chrome-00",
        "matches": [
            "*://*.dcinside.com/*",
            "*://*.dcinside.co.kr/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/runtime-settings-cache.js",
            "src/shared/startup-scheduler.js",
            "src/shared/dom-mutation-bus.js",
            "src/content/appearance/font-config.js",
            "src/content/appearance/font-bootstrap.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-chrome-01",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/ip-network-fast-classifier.js",
            "src/content/core/critical-filter-bootstrap.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-02",
        "matches": [
            "*://*.dcinside.com/*",
            "*://*.dcinside.co.kr/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/block-stats.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-03",
        "matches": [
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/view*",
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/detection-config.js",
            "src/content/detection/text-detector.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-04",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/image/image-account-filter.js",
            "src/content/user/account-activity-blocker.js",
            "src/content/image/image-blocker.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-05",
        "matches": [
            "*://gall.dcinside.com/*",
            "*://www.dcinside.com/*",
            "*://search.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/appearance/font-manager.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-06",
        "matches": [
            "*://gall.dcinside.com/*",
            "*://www.dcinside.com/*",
            "*://search.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/tools/area-picker.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-07",
        "matches": [
            "*://gall.dcinside.com/*",
            "*://www.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/appearance/dc-theme-bridge.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-08",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/gallery/access-guard.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-09",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/gallery/gallery-quick-block.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-10",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/core/content_script.js"
        ],
        "runAt": "document_end"
    },
    {
        "id": "dcb-profile-chrome-11",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/keyword-settings-hot-cache.js",
            "src/shared/keyword-matcher.js",
            "src/content/keyword/keyword-blocker.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-12",
        "matches": [
            "*://gall.dcinside.com/*",
            "*://www.dcinside.com/*",
            "*://search.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/gallery/link-blocker.js"
        ],
        "runAt": "document_end"
    },
    {
        "id": "dcb-profile-chrome-13",
        "matches": [
            "*://www.dcinside.com/*",
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/keyword-settings-hot-cache.js",
            "src/content/gallery/dcbest-source-filter.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-14",
        "matches": [
            "*://gall.dcinside.com/board/*",
            "*://gall.dcinside.com/mgallery/board/*",
            "*://gall.dcinside.com/mini/board/*",
            "*://gall.dcinside.com/mgallery/*",
            "*://gall.dcinside.com/mini/*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-gall.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-chrome-15",
        "matches": [
            "*://www.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-chrome-16",
        "matches": [
            "*://search.dcinside.com/combine*",
            "*://search.dcinside.com/combine/q/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-search.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-chrome-17",
        "matches": [
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-comment.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-18",
        "matches": [
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-img-comment.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-19",
        "matches": [
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*",
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/dccon/cleaner-dccon.js",
            "src/shared/storage/dccon-block-store.js",
            "src/content/dccon/dccon-blocker.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-20",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/storage/user-block-store.js",
            "src/content/user/cleaner-userblock.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-21",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/ip-network-classifier.js",
            "src/content/cleaner/cleaner-foreign-ip.js",
            "src/content/cleaner/cleaner-anonymous.js"
        ],
        "runAt": "document_end",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-22",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-gamemeca.js"
        ],
        "runAt": "document_start",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-23",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-dory.js"
        ],
        "runAt": "document_start",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-24",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-notice.js"
        ],
        "runAt": "document_end",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-25",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/user/ctx-probe.js"
        ],
        "runAt": "document_end",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-26",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/user/uid-badge.js",
            "src/shared/ip-network-classifier.js",
            "src/content/user/member-ip-view.js"
        ],
        "css": [
            "src/content/appearance/comment-author.css"
        ],
        "runAt": "document_end",
        "allFrames": true
    },
    {
        "id": "dcb-profile-chrome-27",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/user/user-memo.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-28",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/tools/auto-refresh.js"
        ],
        "runAt": "document_end",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-29",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/board/view*",
            "*://gall.dcinside.com/mgallery/board/view*",
            "*://gall.dcinside.com/mini/board/view*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/keyword-settings-hot-cache.js",
            "src/shared/keyword-matcher.js",
            "src/content/list/list-filter.js",
            "src/content/keyword/keyword-hider.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-chrome-30",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/appearance/compact-list.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    }
]),
    firefox: Object.freeze([
    {
        "id": "dcb-profile-firefox-00",
        "matches": [
            "*://*.dcinside.com/*",
            "*://*.dcinside.co.kr/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/runtime-settings-cache.js",
            "src/shared/startup-scheduler.js",
            "src/shared/dom-mutation-bus.js",
            "src/content/appearance/font-config.js",
            "src/content/appearance/font-bootstrap.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-firefox-01",
        "matches": [
            "*://gall.dcinside.com/board/lists*",
            "*://gall.dcinside.com/mgallery/board/lists*",
            "*://gall.dcinside.com/mini/board/lists*",
            "*://gall.dcinside.com/person/board/lists*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/shared/ip-network-fast-classifier.js",
            "src/content/core/critical-filter-bootstrap.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-firefox-02",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/gallery/access-guard.js"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-firefox-03",
        "matches": [
            "*://gall.dcinside.com/board/*",
            "*://gall.dcinside.com/mgallery/board/*",
            "*://gall.dcinside.com/mini/board/*",
            "*://gall.dcinside.com/mgallery/*",
            "*://gall.dcinside.com/mini/*",
            "*://gall.dcinside.com/person/board/lists*",
            "*://gall.dcinside.com/person/board/view*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-gall.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-firefox-04",
        "matches": [
            "*://www.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-firefox-05",
        "matches": [
            "*://search.dcinside.com/combine*",
            "*://search.dcinside.com/combine/q/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/cleaner/cleaner-search.js"
        ],
        "runAt": "document_start"
    },
    {
        "id": "dcb-profile-firefox-06",
        "matches": [
            "*://gall.dcinside.com/*"
        ],
        "persistAcrossSessions": true,
        "css": [
            "src/content/appearance/comment-author.css"
        ],
        "runAt": "document_start",
        "allFrames": false
    },
    {
        "id": "dcb-profile-firefox-07",
        "matches": [
            "*://*.dcinside.com/*",
            "*://*.dcinside.co.kr/*"
        ],
        "persistAcrossSessions": true,
        "js": [
            "src/content/core/feature-loader.js"
        ],
        "runAt": "document_idle",
        "allFrames": false
    }
])
  });
})();
