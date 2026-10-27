# Browser autosave and recovery

The Beta keeps one local workspace for this browser address. It is shared by the tabs and accounts using that browser profile. Signing in or out does not separate this workspace or create a cloud backup. A different browser profile, browser, address or port has separate browser storage.

## Save status

- **Saving…** means the current change has not been acknowledged as saved. Continuous typing is capped at a 1,500ms autosave scheduling wait, with a 350ms quiet period. Storage can take additional time.
- **Saved on this device** acknowledges the current graph in this browser. It does not promise a copy on a server or another device.
- **Not saved** opens save recovery. Keep the tab open; download its live backup, retry after a storage failure, or reopen the saved workspace. Reopening asks before discarding unsaved work.
- When a folder is connected, its own status reports connecting, saving or paused/error conditions. Browser acceptance happens before a graph is sent to folder autosave.

Dragging marks the workspace unsaved. Ordinary saves wait until the drag finishes; page visibility/lifecycle flushing can capture its current position. An active drag stays unsaved until its final graph is acknowledged. Closing a tab while changes are pending can produce the browser's unsaved-work warning. A force quit or immediate dismissal of that warning cannot guarantee completion of an asynchronous write.

## Two tabs

The Beta uses **stale-writer refusal**, rather than automatic merging or last-writer overwrite. A save compares the revision the tab opened against the durable revision inside the same IndexedDB transaction. Only a matching tab can commit. Simultaneous writers have one winner; the other keeps its changes in memory and receives a recovery warning. The rule also protects deletions and works without BroadcastChannel notifications.

If another tab saved newer work:

1. Keep the older tab open.
2. Choose **Download this tab’s backup** to keep its unsaved branch, including referenced files.
3. Choose **Reopen saved workspace** to see the latest durable graph. Confirm only when you have kept changes you need.
4. Review the downloaded copy before manually reapplying anything. Restoring a backup replaces the workspace; it does not merge concurrent branches.

Database version 4 retains the existing format-3 records and prevents earlier unsafe version-3 writers from reopening the upgraded database. Reload older app tabs. Do not clear browser storage to fix a conflict.

## Startup and recovery

The canvas is not editable until its saved graph is loaded. Unsupported headers, incomplete records or graph items that cannot be hydrated stop startup, without autosaving an empty projection over the saved data.

Open `/recovery` to download the saved browser copy without starting the canvas or autosave. This copy can differ from an unsaved tab's live backup. Recovery export preserves graph order, connections, metadata and available referenced file bytes. Supported repeated-content recovery retains lossless run information.

A workspace from an unsupported format may require the app version that wrote it; its stored rows are left intact. A missing or unavailable file cannot be reconstructed from a graph reference alone.

## Keeping another copy

Use a downloaded backup on another device or a separately maintained folder backup. Browser storage can be cleared or become unavailable. Real authenticated cloud synchronization, account-isolated workspaces and real sign-in/out integration remain deferred; this policy must not be interpreted as cloud backup or account privacy isolation.

Validation and browser/platform limits for SCRUM-37 are recorded in `beta/qa/scrum-37/REPORT-EN.md` and `RAPPORT-TN.md`.
