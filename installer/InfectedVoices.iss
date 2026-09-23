; Compiled only by scripts/build.mjs --release after Authenticode material is present.
; This script does not embed a certificate and does not produce a file by itself.

#define MyAppName "Infected Voices"
#define MyAppVersion "0.7.0"
#define MyAppExeName "InfectedVoices.exe"

[Setup]
AppId={{7C2E9A14-5B8F-4D33-9E61-2A4F8C0D6B17}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppName}
DefaultDirName={localappdata}\Programs\Infected Voices
DefaultGroupName={#MyAppName}
OutputDir=..\release
OutputBaseFilename=InfectedVoices-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableProgramGroupPage=yes

[Files]
Source: "..\release\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Infected Voices"; Flags: nowait postinstall skipifsilent
