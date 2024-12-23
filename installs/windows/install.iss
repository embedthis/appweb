;
; install.iss -- Inno Setup 5 install configuration file for Embedthis Appweb
;
; Copyright (c) Embedthis Software. All Rights Reserved.
;

[Setup]
AppName=${settings.title}
AppVerName=${settings.title} ${settings.version}
DefaultDirName={pf}\${settings.title}
DefaultGroupName=${settings.title}
UninstallDisplayIcon={app}/${settings.name}.exe
LicenseFile=LICENSE.TXT
ArchitecturesInstallIn64BitMode=x64

[Code]
var
	SslPage: TInputQueryWizardPage;
	HttpPage: TInputQueryWizardPage;
	WebDirPage: TInputDirWizardPage;

procedure InitializeWizard();
begin
	WebDirPage := CreateInputDirPage(wpSelectDir, 'Select Web Documents Directory', 'Where should web files be stored?',
		'Select the folder in which to store web documents, then click Next.', False, '');
	WebDirPage.Add('');
	WebDirPage.values[0] := ExpandConstant('{sd}') + '\appweb\web';

	HttpPage := CreateInputQueryPage(wpSelectComponents, 'HTTP Port', 'Primary TCP/IP Listen Port for HTTP Connections',
		'Please specify the TCP/IP port on which Appweb should listen for HTTP requests.');
	HttpPage.Add('HTTP Port:', False);
	HttpPage.values[0] := '80';

	SslPage := CreateInputQueryPage(wpSelectComponents, 'SSL Port', 'SSL TCP/IP Listen Port for Secure Connections',
		'Please specify the TCP/IP port on which Appweb should listen for HTTPS (SSL) requests.');
	SslPage.Add('SSL Port:', False);
	SslPage.values[0] := '443';
end;


procedure AddPath(keyName: String; dir: String);
var
	newPath, oldPath, key: String;
	paths:		TArrayOfString;
	i:			Integer;
	regHive:	Integer;
begin

  if (IsAdminLoggedOn or IsPowerUserLoggedOn) then begin
    regHive := HKEY_LOCAL_MACHINE;
    key := 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';
  end else begin
    regHive := HKEY_CURRENT_USER;
    key := 'Environment';
  end;

	i := 0;
	if RegValueExists(regHive, key, keyName) then begin
		RegQueryStringValue(regHive, key, keyName, oldPath);
		oldPath := oldPath + ';';

		while (Pos(';', oldPath) > 0) do begin
			SetArrayLength(paths, i + 1);
			paths[i] := Copy(oldPath, 0, Pos(';', oldPath) - 1);
			oldPath := Copy(oldPath, Pos(';', oldPath) + 1, Length(oldPath));
			i := i + 1;

			if dir = paths[i - 1] then begin
				continue;
			end;

			if i = 1 then begin
				newPath := paths[i - 1];
			end else begin
				newPath := newPath + ';' + paths[i - 1];
			end;
		end;
	end;

	if (IsUninstaller() = false) and (dir <> '') then begin
		if (newPath <> '') then begin
			newPath := newPath + ';' + dir;
		end else begin
	    	newPath := dir;
	  end;
  	end;
	RegWriteStringValue(regHive, key, keyName, newPath);
end;


procedure CurStepChanged(CurStep: TSetupStep);
var
  path: String;
  bin: String;
  app: String;
  rc: Integer;
begin
  app := ExpandConstant('{app}');
  if CurStep = ssInstall then
  begin

    path := app + '\bin\appwebMonitor.exe';
    if FileExists(path) then
      Exec(path, '--stop', app, 0, ewWaitUntilTerminated, rc);

    path := app + '\bin\appman.exe';
    if FileExists(path) then
      Exec(path, 'stop', app, 0, ewWaitUntilTerminated, rc);
    end;

    if CurStep = ssPostInstall then
    begin
      if IsTaskSelected('addpath') then begin
        bin := ExpandConstant('{app}\bin');
        AddPath('Path', bin);
      end;
    end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
	app:			String;
	bin:			String;
begin
	if CurUninstallStep = usUninstall then begin
	    bin := ExpandConstant('{app}\bin');
		AddPath('Path', bin);
	end;
	if CurUninstallStep = usDone then begin
	    app := ExpandConstant('{app}');
        RemoveDir(app);
    end;
end;


procedure SaveConf();
var
  app: String;
  web: String;
  documents: String;
  conf: String;
  http: String;
  ssl: String;
begin
  app := ExpandConstant('{app}');
  http := HttpPage.values[0];
  ssl := SslPage.values[0];
  web := WebDirPage.values[0];
  documents := ExtractRelativePath(app + '\', web);
  conf := 'Documents "' + documents + '"' + Chr(10) + 'Listen ' + http + Chr(10) + 'ListenSecure ' + ssl + Chr(10) + 'set LOG_DIR "log"' + Chr(10) + 'set CACHE_DIR "cache"' + Chr(10);
  SaveStringToFile(ExpandConstant('{app}\install.conf'), ExpandConstant(conf), False);
end;


function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if (CurPageID = 6) then
  begin
    WebDirPage.values[0] := ExpandConstant('{app}') + '\web';
  end;
  Result := true;
end;


function GetPort(Param: String): String;
begin
  Result := HttpPage.Values[0];
end;


function GetSSL(Param: String): String;
begin
  Result := SslPage.Values[0];
end;


function IsPresent(const file: String): Boolean;
begin
  file := ExpandConstant(file);
  if FileExists(file) then begin
    Result := True;
  end else begin
    Result := False;
  end
end;


[Icons]
Name: "{group}\${settings.name}Monitor"; Filename: "{app}/bin/${settings.name}Monitor.exe";
Name: "{group}\ReadMe"; Filename: "{app}/README.TXT"

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AppwebMonitor"; ValueData: "{app}\bin\appwebMonitor.exe"

[Dirs]
Name: "{app}\log"; Permissions: system-modify;
Name: "{app}\cache"; Permissions: system-modify;
Name: "{app}\bin"

[UninstallDelete]
Type: files; Name: "{app}\appweb.conf";
Type: files; Name: "{app}\log\access.log";
Type: files; Name: "{app}\log\access.log.old";
Type: files; Name: "{app}\log\access.log.*";
Type: files; Name: "{app}\log\error.log";
Type: files; Name: "{app}\log\error.log.old";
Type: files; Name: "{app}\log\error.log.*";
Type: files; Name: "{app}\cache\*.*";
Type: filesandordirs; Name: "{app}\*.obj";

[Tasks]
Name: addpath; Description: Add ${settings.title} to the system PATH variable;

[Run]
Filename: "{app}/bin/${settings.name}Monitor.exe"; Parameters: "--stop"; WorkingDir: "{app}/bin"; Check: IsPresent('{app}/bin/${settings.name}Monitor.exe'); StatusMsg: "Stopping the Appweb Monitor"; Flags: waituntilterminated; BeforeInstall: SaveConf()

Filename: "{app}/bin/appman.exe"; Parameters: "uninstall"; WorkingDir: "{app}"; Check: IsPresent('{app}/bin/appman.exe'); StatusMsg: "Stopping Appweb"; Flags: waituntilterminated;

Filename: "{app}/bin/appman.exe"; Parameters: "install enable"; WorkingDir: "{app}"; StatusMsg: "Installing Appweb as a Windows Service"; Flags: waituntilterminated;

Filename: "{app}/bin/appman.exe"; Parameters: "start"; WorkingDir: "{app}"; StatusMsg: "Starting the Appweb Server"; Flags: waituntilterminated;

Filename: "{app}/bin/${settings.name}Monitor.exe"; Parameters: ""; WorkingDir: "{app}/bin"; StatusMsg: "Starting the Appweb Monitor"; Flags: waituntilidle;

Filename: "https://www.embedthis.com/appweb/doc/index.html"; Description: "View the Documentation"; Flags: skipifsilent waituntilidle shellexec postinstall;

[UninstallRun]
Filename: "{app}/bin/${settings.name}Monitor.exe"; Parameters: "--stop"; WorkingDir: "{app}"; StatusMsg: "Stopping the Appweb Monitor"; Flags: waituntilterminated;
Filename: "{app}/bin/appman.exe"; Parameters: "uninstall"; WorkingDir: "{app}"; Check: IsPresent('{app}/bin/appman.exe');
Filename: "{app}/bin/removeFiles.exe"; Parameters: "-r -s 5"; WorkingDir: "{app}"; Flags:

[Files]
