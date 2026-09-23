using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace InfectedVoices.Windows;

internal sealed class PopupForm : Form
{
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);

    internal PopupForm(CoreWebView2Environment environment)
    {
        Text = "Infected Voices";
        ClientSize = new Size(560, 780);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(9, 9, 11);
        Controls.Add(_web);
        Shown += async (_, _) =>
        {
            try
            {
                await _web.EnsureCoreWebView2Async(environment);
                _web.CoreWebView2.NavigationStarting += (_, e) =>
                {
                    if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
                        e.Cancel = true;
                };
                _ready.TrySetResult();
            }
            catch (Exception ex)
            {
                _ready.TrySetException(ex);
            }
        };
    }

    internal Task Ready => _ready.Task;

    internal CoreWebView2 Core => _web.CoreWebView2;
}
