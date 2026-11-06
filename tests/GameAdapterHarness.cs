using System;
using System.Collections.Generic;
using CompanionBridge;
namespace GTA { public class Script { public int Interval {get;set;} public event EventHandler Tick; } }
namespace GTBikeV {
 public static class DataTransceiver {
  public enum Status { Off,Engaged,Disengaged,FreeRide,Unavailable }
  public static bool IsDTOK {get;set;}
  public static int Power_w {get;set;}
  public static byte Cadence_rpm {get;set;}
  public static byte HeartRate {get;set;}
  public static float Speed_ms {get;set;}
  public static float TotalDistance_m {get;set;}
  public static long RidingTime_ms {get;set;}
  public static Status ERGMode {get;set;}
  private static short _ERGtargetPower;
  public static void SetTargetPower(short watts) { _ERGtargetPower=watts; }
 }
}
namespace GTBikeV.UI {
 public class TestItem {public bool Enabled{get;set;} public event EventHandler Activated; public void Add(EventHandler h){Activated+=h;} protected internal void OnActivated(object sender){if(Activated!=null)Activated(sender,EventArgs.Empty);} }
 public static class Menus {
  public static int Activations,Saves;
  private static TestItem activateModMenuItem = new TestItem{Enabled=true};
  private static TestItem saveActivityMenuItem = new TestItem{Enabled=true};
  static Menus(){activateModMenuItem.Add((s,e)=>Activations++);activateModMenuItem.Add((s,e)=>GTBikeV.DataTransceiver.IsDTOK=!GTBikeV.DataTransceiver.IsDTOK);saveActivityMenuItem.Add((s,e)=>Saves++);}
 }
}
public class Harness {
 static void Equal(object actual,object expected,string name){if(!object.Equals(actual,expected))throw new Exception(name+": "+actual+" != "+expected);}
 public static int Main(){try{
  var api=new GTBikeApi(typeof(GTBikeV.DataTransceiver),typeof(GTBikeV.UI.Menus));
  GTBikeV.DataTransceiver.IsDTOK=true;GTBikeV.DataTransceiver.Power_w=185;GTBikeV.DataTransceiver.Speed_ms=10;GTBikeV.DataTransceiver.Cadence_rpm=88;GTBikeV.DataTransceiver.HeartRate=142;GTBikeV.DataTransceiver.TotalDistance_m=12345;GTBikeV.DataTransceiver.RidingTime_ms=60000;
  var state=api.Capture();var metrics=(Dictionary<string,object>)state["metrics"];Equal(metrics["speedKph"],36.0,"m/s to km/h");Equal(metrics["distanceKm"],12.345,"meters to km");Equal(metrics["elapsedSeconds"],60.0,"ms to seconds");Equal(metrics["powerW"],185.0,"power");
  GTBikeV.DataTransceiver.Power_w=-1;GTBikeV.DataTransceiver.Cadence_rpm=255;GTBikeV.DataTransceiver.HeartRate=255;metrics=(Dictionary<string,object>)api.Capture()["metrics"];Equal(metrics["powerW"],null,"invalid power");Equal(metrics["cadenceRpm"],null,"invalid cadence");Equal(metrics["heartRateBpm"],null,"invalid HR");
  var result=api.Execute(new Dictionary<string,object>{{"action","erg"},{"enabled",true},{"targetPower",210}});Equal(result["targetPowerW"],(short)210,"ERG target");api.Execute(new Dictionary<string,object>{{"action","target-power"},{"watts",220}});Equal(api.Capture()["targetPowerW"],(short)220,"target update");
  try{api.Execute(new Dictionary<string,object>{{"action","save-activity"}});throw new Exception("Allowed save while moving");}catch(InvalidOperationException){}
  GTBikeV.DataTransceiver.Speed_ms=0;api.Execute(new Dictionary<string,object>{{"action","save-activity"}});Equal(GTBikeV.UI.Menus.Saves,1,"save menu handler");api.Execute(new Dictionary<string,object>{{"action","activate"},{"enabled",false}});Equal(GTBikeV.DataTransceiver.IsDTOK,false,"deactivate menu handler");api.Execute(new Dictionary<string,object>{{"action","activate"},{"enabled",false}});Equal(GTBikeV.UI.Menus.Activations,1,"no duplicate toggle");
  Console.WriteLine("PASS: adapter compilation; units; sentinels; ERG; target; menu dispatch; save guard; idempotent deactivation. Mock GTBikeV only, not an in-game test.");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
