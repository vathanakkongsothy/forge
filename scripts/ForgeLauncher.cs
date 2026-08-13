using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

internal static class ForgeLauncher
{
    private const string Host = "http://127.0.0.1:8787";

    [STAThread]
    private static int Main()
    {
        try
        {
            string root = FindRoot();
            if (root == null)
            {
                Fail("Could not find the Forge project (package.json + dist). Put Forge.exe next to the repo or in release\\.");
                return 1;
            }

            if (!HostReady())
            {
                string node = FindNode();
                if (node == null)
                {
                    Fail("Node.js was not found. Install Node 22+ and try again.");
                    return 1;
                }

                var start = new ProcessStartInfo();
                start.FileName = node;
                start.Arguments = "--import tsx packages/agent-host/src/index.ts";
                start.WorkingDirectory = root;
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                start.WindowStyle = ProcessWindowStyle.Hidden;
                try { start.EnvironmentVariables["FORGE_HOST_PORT"] = "8787"; } catch { }
                try { start.EnvironmentVariables["FORGE_UI_DIR"] = Path.Combine(root, "dist"); } catch { }
                Process.Start(start);

                if (!WaitForHost(20000))
                {
                    Fail("The Forge host started but did not become ready on " + Host);
                    return 1;
                }
            }

            string edge = FindEdge();
            if (edge == null)
            {
                Process.Start(Host);
                return 0;
            }

            string profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ForgeDesktop");
            Directory.CreateDirectory(profile);

            var edgeStart = new ProcessStartInfo();
            edgeStart.FileName = edge;
            edgeStart.Arguments = "--app=" + Host + " --user-data-dir=\"" + profile + "\" --window-size=1560,940";
            edgeStart.UseShellExecute = false;
            Process.Start(edgeStart);
            return 0;
        }
        catch (Exception ex)
        {
            Fail(ex.Message);
            return 1;
        }
    }

    private static string FindRoot()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        for (int i = 0; i < 6 && !string.IsNullOrEmpty(dir); i++)
        {
            if (File.Exists(Path.Combine(dir, "package.json")) &&
                File.Exists(Path.Combine(dir, "dist", "index.html")))
            {
                return dir;
            }
            dir = Directory.GetParent(dir) == null ? null : Directory.GetParent(dir).FullName;
        }
        return null;
    }

    private static string FindNode()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string part in path.Split(Path.PathSeparator))
        {
            try
            {
                string candidate = Path.Combine(part.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(pf)) return pf;
        return null;
    }

    private static string FindEdge()
    {
        string[] paths = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (string p in paths)
        {
            if (File.Exists(p)) return p;
        }
        return null;
    }

    private static bool HostReady()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Host + "/health");
            req.Timeout = 800;
            using (var resp = (HttpWebResponse)req.GetResponse())
            {
                return resp.StatusCode == HttpStatusCode.OK;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForHost(int ms)
    {
        int steps = Math.Max(1, ms / 250);
        for (int i = 0; i < steps; i++)
        {
            if (HostReady()) return true;
            Thread.Sleep(250);
        }
        return HostReady();
    }

    private static void Fail(string message)
    {
        try
        {
            Process.Start("mshta", "javascript:alert(\"" + message.Replace("\"", "'") + "\");close()");
        }
        catch { }
    }
}
