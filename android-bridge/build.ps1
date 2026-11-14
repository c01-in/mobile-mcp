param([string]$JavaHome='C:\Users\Administrator\.codex\tools\clipboard-bridge-build\jdk\jdk-21.0.12.1+1')
$ErrorActionPreference='Stop'
$tools='E:\Dev\Android\Sdk\build-tools\36.0.0'
$android='E:\Dev\Android\Sdk\platforms\android-36\android.jar'
$cache=Join-Path 'E:\Cache\MobileMCP\bridge-build' ([Guid]::NewGuid().ToString('N'))
$keys='E:\Dev\Secrets\mobile-mcp'
if (!(Test-Path "$JavaHome\bin\javac.exe")) { throw 'Existing JDK missing' }
if ((Get-PSDrive E).Free -lt 512MB) { throw 'E drive space insufficient' }
$env:JAVA_HOME=$JavaHome
$env:PATH="$JavaHome\bin;"+$env:PATH
$env:TEMP='E:\Cache\MobileMCP'; $env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path "$cache\classes","$cache\dex","$PSScriptRoot\dist",$keys | Out-Null
if (!(Test-Path "$keys\bridge.jks")) {
    if (!(Test-Path "$keys\keystore-password.txt")) {
        [IO.File]::WriteAllText("$keys\keystore-password.txt",[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
    }
    & "$JavaHome\bin\keytool.exe" -genkeypair -keystore "$keys\bridge.jks" -storepass:file "$keys\keystore-password.txt" -keypass:file "$keys\keystore-password.txt" -alias bridge -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Transages Mobile Bridge'
    if ($LASTEXITCODE) { throw 'Signing key generation failed' }
}
$sources=@(Get-ChildItem "$PSScriptRoot\src" -Recurse -Filter '*.java' | ForEach-Object FullName)
& "$JavaHome\bin\javac.exe" --release 8 -encoding UTF-8 -classpath $android -d "$cache\classes" @sources
if ($LASTEXITCODE) { throw 'Java compile failed' }
$classes=@(Get-ChildItem "$cache\classes" -Recurse -Filter '*.class' | ForEach-Object FullName)
& "$tools\d8.bat" --lib $android --min-api 23 --output "$cache\dex" @classes
if ($LASTEXITCODE) { throw 'DEX compile failed' }
& "$tools\aapt2.exe" link -I $android --manifest "$PSScriptRoot\AndroidManifest.xml" -o "$cache\unsigned.apk"
if ($LASTEXITCODE) { throw 'Manifest link failed' }
& "$JavaHome\bin\jar.exe" uf "$cache\unsigned.apk" -C "$cache\dex" classes.dex
if ($LASTEXITCODE) { throw 'APK pack failed' }
& "$tools\zipalign.exe" -f 4 "$cache\unsigned.apk" "$cache\aligned.apk"
if ($LASTEXITCODE) { throw 'APK align failed' }
& "$tools\apksigner.bat" sign --ks "$keys\bridge.jks" --ks-key-alias bridge --ks-pass "file:$keys\keystore-password.txt" --out "$PSScriptRoot\dist\mobile-bridge.apk" "$cache\aligned.apk"
if ($LASTEXITCODE) { throw 'APK signing failed' }
& "$tools\apksigner.bat" verify "$PSScriptRoot\dist\mobile-bridge.apk"
if ($LASTEXITCODE) { throw 'APK signature invalid' }
Get-FileHash "$PSScriptRoot\dist\mobile-bridge.apk"
