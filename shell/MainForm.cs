using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace InfectedVoices.Windows;

internal sealed class MainForm : Form
{
    private const string Host = "infectedvoices.localhost";
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private CoreWebView2Environment? _environment;

    private static readonly string[] ExternalHosts =
    [
        "infectedvoices.space",
        "nation.infectedvoices.space",
        "accounts.google.com",
        "appleid.apple.com",
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "www.image-line.com",
        "www.roexaudio.com",
        "roexaudio.com",
        "soundcloud.com",
        "www.soundcloud.com",
        "distrokid.com",
        "www.distrokid.com",
        "www.gnu.org",
        "storage.googleapis.com",
        "tonn-portal.roexaudio.com"
    ];

    internal MainForm()
    {
        Text = "Infected Voices";
        ClientSize = new Size(1280, 800);
        MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9, 9, 11);
        ForeColor = Color.FromArgb(250, 250, 250);
        _web.DefaultBackgroundColor = Color.FromArgb(9, 9, 11);
        Controls.Add(_web);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            await BootAsync();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowNotice("The WebView2 Runtime is not installed. Install Microsoft's Evergreen Runtime. This repository does not bundle it.");
        }
        catch (Exception ex)
        {
            ShowNotice(ex.Message);
        }
    }

    private async Task BootAsync()
    {
        var location = PayloadLocator.Find(AppContext.BaseDirectory);
        if (location.Problem != PayloadProblem.Ok || location.Directory is null)
        {
            ShowNotice(location.Detail);
            return;
        }

        var userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "InfectedVoices",
            "WebView2");
        Directory.CreateDirectory(userData);
        _environment = await CoreWebView2Environment.CreateAsync(null, userData);
        await _web.EnsureCoreWebView2Async(_environment);
        var core = _web.CoreWebView2;
        core.Settings.AreDevToolsEnabled = string.Equals(
            Environment.GetEnvironmentVariable("IV_WEBVIEW_DEVTOOLS"),
            "1",
            StringComparison.Ordinal);
        core.Settings.IsStatusBarEnabled = false;

        var preloadPath = Path.Combine(AppContext.BaseDirectory, "ShellPreload.js");
        var script = await File.ReadAllTextAsync(preloadPath);
        if (!script.Contains("__CORE_PIN__", StringComparison.Ordinal))
        {
            ShowNotice("ShellPreload.js is missing the Core pin marker. The shell will not start.");
            return;
        }

        script = script.Replace("__CORE_PIN__", location.Detail, StringComparison.Ordinal);
        await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
        core.SetVirtualHostNameToFolderMapping(Host, location.Directory, CoreWebView2HostResourceAccessKind.Allow);
        core.NavigationStarting += (_, args) => OnNavigationStarting(args);
        core.NewWindowRequested += (_, args) => OnNewWindow(args);
        core.Navigate($"https://{Host}/index.html");
    }

    private void OnNavigationStarting(CoreWebView2NavigationStartingEventArgs args)
    {
        if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) && uri is not null && IsAppHost(uri)) return;
        args.Cancel = true;
        if (uri is not null) TryOpenExternal(uri);
    }

    private async void OnNewWindow(CoreWebView2NewWindowRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            args.Handled = true;
            if (_environment is null || !Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || !IsAllowlistedHttps(uri))
                return;
            var popup = new PopupForm(_environment);
            popup.Show(this);
            await popup.Ready;
            args.NewWindow = popup.Core;
        }
        catch (Exception ex)
        {
            args.Handled = true;
            Console.Error.WriteLine(ex.Message);
        }
        finally
        {
            deferral.Complete();
        }
    }

    private static bool IsAppHost(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps
        && uri.Host.Equals(Host, StringComparison.OrdinalIgnoreCase);

    private static bool IsAllowlistedHttps(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps
        && uri.UserInfo.Length == 0
        && ExternalHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase);

    private static void TryOpenExternal(Uri uri)
    {
        if (!IsAllowlistedHttps(uri)) return;
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private void ShowNotice(string message)
    {
        Controls.Clear();
        Controls.Add(new Label
        {
            Text = message,
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(250, 250, 250),
            BackColor = Color.FromArgb(9, 9, 11),
            TextAlign = ContentAlignment.MiddleCenter,
            Padding = new Padding(32),
            AutoSize = false
        });
    }
}
