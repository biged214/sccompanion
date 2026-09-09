# Microsoft Store build

This is separate from the GitHub EXE/MSI and Linux releases. The workflow does not
publish a release, change the GitHub update feed, or submit anything to Microsoft.

## Required Partner Center identity

Use an MSIX submission product, not the EXE/MSI package-URL submission route.
Copy these public values exactly from Product identity:

- Package/Identity/Name
- Package/Identity/Publisher (full CN= value)
- Package/Properties/PublisherDisplayName

In GitHub Actions, open **Microsoft Store MSIX**, select **Run workflow** on main,
and enter those values. Download the completed run's Store artifact, extract the
ZIP, and upload the MSIX under Partner Center's MSIX Packages page. No local build
commands are required. Microsoft handles distribution signing after certification.
The artifact is not signed for ordinary local sideloading.

## Scope and certification checks

- x64 Windows 11 (minimum build 22000); requires the system WebView2 Runtime.
  Windows 10 is intentionally excluded from this initial package.
- Store build has separate Tauri identity and local data. Existing GitHub app
  settings and session history are not automatically migrated.
- GitHub updater and registry autostart plugins are omitted in the Store binary.
  Store updates are managed by Microsoft Store. Startup toggle is unavailable.
- Static MSVC runtime avoids adding a Visual C++ redistributable installer.
- Full-trust capability is needed for local Game.log access and the desktop tray.
  Explain these uses in certification notes when requested.
- Version is the app version plus `.0`; increment the app version for another
  submission. Do not overwrite a previously submitted binary at the same version.

Before submission, validate the actual package through a signed test installation
or Store flight: launch, WebView2 availability, tray/quit, notifications, external
links, log file access, separate local storage, uninstall, and Store updates.
Packaging validation alone does not prove Store certification or runtime behavior.

The Store privacy policy must be hosted publicly and linked in the listing and app.
The draft privacy policy from the conversation still needs publisher/contact details
and hosting before submission.
