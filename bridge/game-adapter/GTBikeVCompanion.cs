using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using GTA;

namespace CompanionBridge
{
    public sealed class GTBikeVCompanion : Script
    {
        private readonly string adapterId = Guid.NewGuid().ToString();
        private readonly string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GTBikeVCompanion");
        private int writing;
        private GTBikeApi api;
        private DateTime nextLookup = DateTime.MinValue;
        public GTBikeVCompanion()
        {
            Directory.CreateDirectory(directory); Directory.CreateDirectory(Path.Combine(directory, "commands"));
            Interval = 250;
            Tick += OnTick;
        }
        private void FindMod()
        {
            if (api != null || DateTime.UtcNow < nextLookup) return;
            nextLookup = DateTime.UtcNow.AddSeconds(2);
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type data = assembly.GetType("GTBikeV.DataTransceiver", false);
                if (data == null) continue;
                api = new GTBikeApi(data, assembly.GetType("GTBikeV.UI.Menus", false));
                return;
            }
        }
        private void OnTick(object sender, EventArgs args)
        {
            if (Interlocked.CompareExchange(ref writing, 1, 0) != 0) return;
            Dictionary<string, object> snapshot;
            try
            {
                FindMod();
                ProcessCommand(); // All mod calls execute on the game script thread.
                snapshot = api == null ? new Dictionary<string, object> { { "modLoaded", false }, { "trainerConnected", false }, { "bindingStatus", "waiting-for-gtbikev" } } : api.Capture();
            }
            catch (Exception e)
            {
                snapshot = new Dictionary<string, object> { { "modLoaded", api != null }, { "trainerConnected", false }, { "bindingStatus", "adapter-error: " + e.GetBaseException().GetType().Name } };
                Log(e); api = null;
            }
            snapshot["version"] = 1; snapshot["source"] = "gtbikev-shvdn"; snapshot["adapterId"] = adapterId; snapshot["capturedAt"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            Task.Run(delegate { try { AtomicWrite(Path.Combine(directory, "telemetry.json"), snapshot); } catch (Exception e) { Log(e); } finally { Interlocked.Exchange(ref writing, 0); } });
        }
        private void ProcessCommand()
        {
            foreach (string path in Directory.GetFiles(Path.Combine(directory, "commands"), "*.json"))
            {
                string id = Path.GetFileNameWithoutExtension(path); Guid parsed;
                if (!Guid.TryParse(id, out parsed)) continue; // Excludes acks and old processing files.
                string claimed = path + ".processing";
                try { File.Move(path, claimed); } catch (IOException) { continue; }
                Dictionary<string, object> ack = new Dictionary<string, object> { { "id", id }, { "adapterId", adapterId } };
                try
                {
                    if (new FileInfo(claimed).Length > 8192) throw new InvalidOperationException("Orden demasiado grande");
                    Dictionary<string, object> command = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(claimed, Encoding.UTF8));
                    if (Convert.ToString(command["id"]) != id || Convert.ToString(command["adapterId"]) != adapterId) throw new InvalidOperationException("Orden para otro adaptador");
                    DateTime expires = DateTime.Parse(Convert.ToString(command["expiresAt"]), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime();
                    if (expires < DateTime.UtcNow || expires > DateTime.UtcNow.AddSeconds(5)) throw new InvalidOperationException("Orden caducada");
                    if (api == null) throw new InvalidOperationException("GTBikeV no está disponible");
                    ack["result"] = api.Execute(command); ack["ok"] = true;
                }
                catch (Exception e) { ack["ok"] = false; ack["error"] = e.GetBaseException().Message; }
                try { AtomicWrite(Path.Combine(directory, "commands", id + ".ack.json"), ack); } finally { File.Delete(claimed); }
                break;
            }
        }
        private static void AtomicWrite(string path, object value)
        {
            string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try { File.WriteAllText(temp, new JavaScriptSerializer().Serialize(value), new UTF8Encoding(false)); if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path); }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        private void Log(Exception e)
        {
            try { string path = Path.Combine(directory, "adapter.log"); if (File.Exists(path) && new FileInfo(path).Length > 1024 * 1024) File.WriteAllText(path, ""); File.AppendAllText(path, DateTime.UtcNow.ToString("o") + " " + e.GetBaseException().Message + Environment.NewLine); } catch { }
        }
    }
}
