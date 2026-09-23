namespace InfectedVoices.Windows;

internal enum PayloadProblem
{
    Ok,
    Missing,
    PinMismatch,
    NotBrowserPayload
}

internal sealed record PayloadLocation(PayloadProblem Problem, string? Directory, string Detail);

internal static class PayloadLocator
{
    internal static PayloadLocation Find(string baseDirectory)
    {
        var expectedPath = Path.Combine(baseDirectory, "CORE-PIN");
        if (!File.Exists(expectedPath))
        {
            return new PayloadLocation(PayloadProblem.Missing, null, "CORE-PIN was not copied next to the shell.");
        }

        var expected = File.ReadAllText(expectedPath).Trim();
        var payload = FindPayloadDirectory(baseDirectory);
        if (payload is null)
        {
            return new PayloadLocation(
                PayloadProblem.Missing,
                null,
                "No payload/index.html was found. Run node scripts/sync-core.mjs.");
        }

        var pinFile = Path.Combine(payload, "CORE-PIN");
        var markerFile = Path.Combine(payload, "PAYLOAD.txt");
        if (!File.Exists(pinFile) || !File.Exists(markerFile))
        {
            return new PayloadLocation(PayloadProblem.Missing, payload, "payload is missing CORE-PIN or PAYLOAD.txt.");
        }

        var actual = File.ReadAllText(pinFile).Trim();
        if (!string.Equals(actual, expected, StringComparison.Ordinal))
        {
            return new PayloadLocation(
                PayloadProblem.PinMismatch,
                payload,
                $"payload pin {actual} does not match shell pin {expected}.");
        }

        var marker = File.ReadAllText(markerFile);
        if (!marker.Contains("source=core-browser-dist", StringComparison.Ordinal)
            || !marker.Contains("includes=build:web", StringComparison.Ordinal))
        {
            return new PayloadLocation(
                PayloadProblem.NotBrowserPayload,
                payload,
                "payload is not the Core browser build produced through build:web.");
        }

        return new PayloadLocation(PayloadProblem.Ok, payload, expected);
    }

    private static string? FindPayloadDirectory(string baseDirectory)
    {
        var dir = new DirectoryInfo(baseDirectory);
        for (var depth = 0; depth < 8 && dir is not null; depth++)
        {
            var candidate = Path.Combine(dir.FullName, "payload");
            if (File.Exists(Path.Combine(candidate, "index.html"))) return candidate;
            dir = dir.Parent;
        }

        return null;
    }
}
