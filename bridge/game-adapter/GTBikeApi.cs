using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;

namespace CompanionBridge
{
    // Only names supplied from GTBikeV 0.8.0.4 and the standard LemonUI event entry point.
    // Runs on a ScriptHookVDotNet Tick, never on the HTTP server thread.
    public sealed class GTBikeApi
    {
        private readonly Type data;
        private readonly Type menus;
        private readonly GameMenuApi gameMenus;
        private const BindingFlags Static = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
        private const BindingFlags Instance = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
        public GTBikeApi(Type dataType, Type menusType)
        {
            data = dataType; menus = menusType;
            gameMenus = new GameMenuApi(menusType,ActivateMenu);
            if (data == null || data.FullName != "GTBikeV.DataTransceiver") throw new InvalidOperationException("DataTransceiver no disponible");
            Require("Power_w", typeof(int)); Require("Cadence_rpm", typeof(byte)); Require("HeartRate", typeof(byte));
            Require("Speed_ms", typeof(float)); Require("TotalDistance_m", typeof(float)); Require("RidingTime_ms", typeof(long)); Require("IsDTOK", typeof(bool));
        }
        private void Require(string name, Type type)
        {
            PropertyInfo property = data.GetProperty(name, Static);
            if (property == null || property.PropertyType != type || property.GetGetMethod(true) == null) throw new InvalidOperationException("Miembro incompatible: " + name);
        }
        private object Get(string name)
        {
            PropertyInfo property = data.GetProperty(name, Static);
            if (property != null) return property.GetValue(null, null);
            FieldInfo field = data.GetField(name, Static);
            if (field != null) return field.GetValue(null);
            throw new InvalidOperationException("Miembro no disponible: " + name);
        }
        private static object Number(object value, double min, double max, double scale)
        {
            double n = Convert.ToDouble(value, CultureInfo.InvariantCulture);
            return double.IsNaN(n) || double.IsInfinity(n) || n < min || n > max ? null : (object)(n * scale);
        }
        public bool Ready { get { return (bool)Get("IsDTOK"); } }
        private bool ErgAvailable
        {
            get
            {
                PropertyInfo erg = data.GetProperty("ERGMode", Static);
                return erg != null && erg.CanWrite && erg.PropertyType.IsEnum && Enum.IsDefined(erg.PropertyType, "Engaged") && Enum.IsDefined(erg.PropertyType, "Off") &&
                    data.GetMethod("SetTargetPower", Static, null, new Type[] { typeof(short) }, null) != null && data.GetField("_ERGtargetPower", Static) != null;
            }
        }
        private object MenuItem(string field)
        {
            if (menus == null) return null;
            FieldInfo f = menus.GetField(field, Static);
            return f == null ? null : f.GetValue(null);
        }
        private MethodInfo MenuEntry(object item)
        {
            return item == null ? null : item.GetType().GetMethod("OnActivated", Instance, null, new Type[] { typeof(object) }, null);
        }
        private bool HasHandler(object item, int min)
        {
            if (item == null || MenuEntry(item) == null) return false;
            Type type = item.GetType();
            while (type != null)
            {
                FieldInfo field = type.GetField("Activated", Instance | BindingFlags.DeclaredOnly);
                if (field != null) { Delegate handler = field.GetValue(item) as Delegate; return handler != null && handler.GetInvocationList().Length >= min; }
                type = type.BaseType;
            }
            return false;
        }
        public List<string> Capabilities()
        {
            List<string> actions = new List<string>();
            if (ErgAvailable) { actions.Add("erg"); actions.Add("target-power"); }
            if (HasHandler(MenuItem("activateModMenuItem"), 2)) actions.Add("activate");
            if (HasHandler(MenuItem("saveActivityMenuItem"), 1)) actions.Add("save-activity");
            actions.AddRange(gameMenus.Capabilities());
            return actions;
        }
        public Dictionary<string, object> Capture()
        {
            bool ready = Ready;
            Dictionary<string, object> metrics = new Dictionary<string, object>();
            metrics["powerW"] = ready ? Number(Get("Power_w"), 0, 5000, 1) : null;
            metrics["cadenceRpm"] = ready ? Number(Get("Cadence_rpm"), 0, 254, 1) : null;
            metrics["heartRateBpm"] = ready ? Number(Get("HeartRate"), 1, 254, 1) : null;
            metrics["speedKph"] = ready ? Number(Get("Speed_ms"), 0, 111.1, 3.6) : null;
            metrics["distanceKm"] = Number(Get("TotalDistance_m"), 0, 1e8, 0.001);
            metrics["elapsedSeconds"] = Number(Get("RidingTime_ms"), 0, 1e11, 0.001);
            metrics["ascentM"] = null; // No verified cumulative ascent member supplied.
            Dictionary<string, object> state = new Dictionary<string, object>();
            state["metrics"] = metrics; state["modLoaded"] = true; state["trainerConnected"] = ready;
            state["commands"] = Capabilities(); state["bindingStatus"] = "gtbikev-0.8.0.4-members-matched";
            state["ergMode"] = ErgAvailable ? Get("ERGMode").ToString() : null;
            state["targetPowerW"] = ErgAvailable ? Get("_ERGtargetPower") : null;
            try { state["gameUi"] = gameMenus.Capture(); } catch { state["gameUi"] = null; }
            return state;
        }
        private static int Int(Dictionary<string, object> command, string key)
        {
            if (!command.ContainsKey(key)) throw new InvalidOperationException("Falta " + key);
            double value = Convert.ToDouble(command[key], CultureInfo.InvariantCulture);
            if (value != Math.Truncate(value) || value < 50 || value > 600) throw new InvalidOperationException("Potencia fuera del intervalo 50-600 W");
            return (int)value;
        }
        private void ActivateMenu(string field, int minimumHandlers)
        {
            object item = MenuItem(field);
            if (!HasHandler(item, minimumHandlers)) throw new InvalidOperationException("La acción del menú no tiene manejador disponible");
            PropertyInfo enabled = item.GetType().GetProperty("Enabled", Instance);
            if (enabled == null || !(bool)enabled.GetValue(item, null)) throw new InvalidOperationException("La opción está desactivada en el menú de GTBikeV");
            MenuEntry(item).Invoke(item, new object[] { item });
        }
        public Dictionary<string, object> Execute(Dictionary<string, object> command)
        {
            string action = Convert.ToString(command["action"], CultureInfo.InvariantCulture);
            if (!Capabilities().Contains(action)) throw new InvalidOperationException("Orden no compatible con esta versión del mod");
            if (gameMenus.Capabilities().Contains(action)) return gameMenus.Execute(command);
            if (action == "activate")
            {
                if (!(command["enabled"] is bool)) throw new InvalidOperationException("Estado de activación no válido");
                bool desired = (bool)command["enabled"];
                if (desired != Ready) ActivateMenu("activateModMenuItem", 2);
                return new Dictionary<string, object> { { "menuActionDispatched", true }, { "requestedEnabled", desired } };
            }
            if (action == "save-activity")
            {
                if (!Ready || Convert.ToDouble(Get("Speed_ms"), CultureInfo.InvariantCulture) < 0 || Convert.ToDouble(Get("Speed_ms"), CultureInfo.InvariantCulture) >= 0.05) throw new InvalidOperationException("Detén la bicicleta antes de finalizar y guardar la actividad");
                ActivateMenu("saveActivityMenuItem", 1);
                return new Dictionary<string, object> { { "menuActionDispatched", true }, { "fitSaveRequested", true } };
            }
            if (!Ready) throw new InvalidOperationException("Los receptores del mod no están listos");
            PropertyInfo erg = data.GetProperty("ERGMode", Static);
            if (action == "erg")
            {
                if (!(command["enabled"] is bool)) throw new InvalidOperationException("Estado ERG no válido");
                bool enabled = (bool)command["enabled"];
                int target = Int(command, "targetPower");
                erg.SetValue(null, Enum.Parse(erg.PropertyType, enabled ? "Engaged" : "Off"), null);
                if (Get("ERGMode").ToString() != (enabled ? "Engaged" : "Off")) throw new InvalidOperationException("GTBikeV no dispone de control de resistencia para ERG");
                if (enabled) data.GetMethod("SetTargetPower", Static).Invoke(null, new object[] { (short)target });
            }
            else if (action == "target-power")
            {
                if (Get("ERGMode").ToString() != "Engaged") throw new InvalidOperationException("Activa ERG antes de cambiar la potencia objetivo");
                data.GetMethod("SetTargetPower", Static).Invoke(null, new object[] { (short)Int(command, "watts") });
            }
            else throw new InvalidOperationException("Orden no reconocida");
            return new Dictionary<string, object> { { "ergMode", Get("ERGMode").ToString() }, { "targetPowerW", Get("_ERGtargetPower") }, { "acceptedByMod", true } };
        }
    }
}
