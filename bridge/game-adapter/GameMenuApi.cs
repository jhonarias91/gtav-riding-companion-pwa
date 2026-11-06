using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Reflection;

namespace CompanionBridge
{
    public sealed class GameMenuApi
    {
        private readonly Type menus;
        private readonly Action<string, int> activate;
        private const BindingFlags S = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        private const BindingFlags I = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        private static readonly Dictionary<string,string> Lists = new Dictionary<string,string> { {"bike","bikeListMenuItem"},{"character","pedListMenuItem"},{"difficulty","trainerDiffMenuItem"},{"gearing","virtualGearsSubMenu"} };
        private static readonly Dictionary<string,string> Toggles = new Dictionary<string,string> { {"autopilot","autodriveMenuItem"},{"obstacles","avoidObstaclesMenuItem"},{"road-feel","trainerRoadFeelMenuItem"} };
        public GameMenuApi(Type type, Action<string,int> activator) { menus=type;activate=activator; }
        private object Field(string name) { FieldInfo f=menus==null?null:menus.GetField(name,S);return f==null?null:f.GetValue(null); }
        private static object Read(object item,string name) { if(item==null)return null;PropertyInfo p=item.GetType().GetProperty(name,I);if(p!=null&&p.CanRead)return p.GetValue(item,null);FieldInfo f=item.GetType().GetField(name,I);return f==null?null:f.GetValue(item); }
        private static bool Flag(object item,string name) { return object.Equals(Read(item,name),true); }
        private static void Write(object item,string name,object value) { if(item==null)throw new InvalidOperationException("La ventana aún no está disponible");PropertyInfo p=item.GetType().GetProperty(name,I);if(p==null||!p.CanWrite)throw new InvalidOperationException("Miembro de interfaz incompatible: "+name);p.SetValue(item,value,null); }
        private static string Text(object item,int length) { string value=Convert.ToString(item,CultureInfo.CurrentCulture)??"";return value.Length>length?value.Substring(0,length):value; }
        private static IList Items(object item,string name) { return Read(item,name) as IList; }
        private static int Index(object item,string name) { object value=Read(item,name);return value is int?(int)value:-1; }
        private static MethodInfo Method(object item,string name) { return item==null?null:item.GetType().GetMethod(name,I,null,Type.EmptyTypes,null); }
        private void CloseViews() { foreach(string field in new string[]{"courseSelectionView","workoutSelectionView","activitySummaryView","deviceSelectionView","aboutInfoView"}) { object view=Field(field);if(Flag(view,"Visible")){MethodInfo close=Method(view,"Close");if(close==null)throw new InvalidOperationException("No se puede cerrar la ventana actual");close.Invoke(view,null);} } }
        private void CloseMenus() { MethodInfo method=menus==null?null:menus.GetMethod("CloseMenus",S);if(method==null)throw new InvalidOperationException("El menú del mod no está disponible");method.Invoke(null,null); }
        private static void Enabled(object item) { if(!Flag(item,"Enabled"))throw new InvalidOperationException("La opción está desactivada en el juego"); }
        private object CourseView { get {return Field("courseSelectionView");} }
        private bool CoursesAvailable { get {object view=CourseView;return view!=null&&view.GetType().GetProperty("Index",I)!=null&&view.GetType().GetProperty("ItemList",I)!=null&&view.GetType().GetMethod("SelectCourseButton_OnRelease",I)!=null;} }
        public List<string> Capabilities() {
            List<string> result=new List<string>();if(menus==null)return result;
            if(Field("mainMenu")!=null&&menus.GetMethod("CloseMenus",S)!=null){result.Add("open-menu");result.Add("close-menu");}
            if(CoursesAvailable){result.Add("browse-course");result.Add("course-options");result.Add("select-course");}
            if(Field("autodriveMenuItem")!=null)result.Add("game-toggle");
            if(Field("bikeListMenuItem")!=null)result.Add("game-option");
            Type config=menus.Assembly.GetType("GTBikeV.Config",false);if(config!=null&&config.GetProperty("UserFTP",S)!=null&&config.GetProperty("UserWeight",S)!=null)result.Add("game-profile");
            return result;
        }
        private static string CourseKey(object course,int index) { return index==0?"none":Text(Read(course,"Id")??course,120); }
        private Dictionary<string,object> Course() {
            object view=CourseView;IList items=Items(view,"ItemList");int index=Index(view,"Index");int count=items==null?0:items.Count;object course=index>0&&index<count?items[index]:null;
            List<object> choices=new List<object>();if(items!=null)for(int n=0;n<Math.Min(count,160);n++)choices.Add(new Dictionary<string,object>{{"index",n},{"key",CourseKey(items[n],n)},{"label",n==0?"Rodaje libre / Sin recorrido":Text(items[n],100)}});
            object author=Read(course,"Author");List<string> categories=new List<string>();IEnumerable values=Read(course,"Category") as IEnumerable;if(values!=null)foreach(object value in values){if(categories.Count==8)break;categories.Add(Text(value,40));}
            return new Dictionary<string,object>{{"visible",Flag(view,"Visible")},{"index",index},{"total",count},{"choices",choices},{"key",CourseKey(course,index)},{"name",course==null?"Rodaje libre":Text(course,120)},{"description",Text(Read(course,"Description"),1200)},{"distanceKm",Read(course,"Distance")},{"ascentM",Read(course,"ElevationGain")},{"author",Text(Read(author,"Name"),120)},{"category",string.Join(", ",categories.ToArray())},{"loopAllowed",Flag(FieldMember(view,"_loopCourse"),"Visible")},{"reverseAllowed",Flag(FieldMember(view,"_reverseCourse"),"Visible")},{"loop",Flag(FieldMember(view,"_loopCourse"),"Checked")},{"reverse",Flag(FieldMember(view,"_reverseCourse"),"Checked")}};
        }
        private static object FieldMember(object target,string field) { FieldInfo f=target==null?null:target.GetType().GetField(field,I);return f==null?null:f.GetValue(target); }
        public Dictionary<string,object> Capture() {
            Dictionary<string,object> result=new Dictionary<string,object>();if(menus==null)return result;
            List<object> options=new List<object>();foreach(var option in Lists){object item=Field(option.Value);if(item==null)continue;IList values=Items(item,"Items");List<string> choices=new List<string>();if(values!=null)for(int n=0;n<Math.Min(values.Count,64);n++)choices.Add(Text(values[n],80));options.Add(new Dictionary<string,object>{{"name",option.Key},{"enabled",Flag(item,"Enabled")},{"index",Index(item,"SelectedIndex")},{"choices",choices}});}
            List<object> toggles=new List<object>();foreach(var toggle in Toggles){object item=Field(toggle.Value);if(item!=null)toggles.Add(new Dictionary<string,object>{{"name",toggle.Key},{"enabled",Flag(item,"Enabled")},{"checked",Flag(item,"Checked")}});}
            result["options"]=options;result["toggles"]=toggles;result["course"]=CoursesAvailable?Course():null;
            result["activeCourse"]=Text(Read(Field("courseSelectionMenuItem"),"AltTitle"),160);
            Type config=menus.Assembly.GetType("GTBikeV.Config",false);foreach(string prop in new string[]{"UserWeight","UserFTP"}){PropertyInfo p=config==null?null:config.GetProperty(prop,S);result[prop=="UserWeight"?"weightKg":"ftpW"]=p==null?null:p.GetValue(null,null);}
            result["routesEnabled"]=Flag(Field("courseSelectionMenuItem"),"Enabled");
            result["workoutsEnabled"]=Flag(Field("workoutSelectionSubmenuItem"),"Enabled");
            return result;
        }
        private void RequireCourse(Dictionary<string,object> command) { if(!CoursesAvailable||!Flag(CourseView,"Visible"))throw new InvalidOperationException("Abre la selección de recorrido primero");IList items=Items(CourseView,"ItemList");int index=Index(CourseView,"Index");if(items==null||index<0||index>=items.Count)throw new InvalidOperationException("La biblioteca de recorridos no está lista");if(command.ContainsKey("expectedKey")&&Convert.ToString(command["expectedKey"])!=CourseKey(items[index],index))throw new InvalidOperationException("El recorrido cambió en el juego. Revisa la selección y vuelve a intentar"); }
        public Dictionary<string,object> Execute(Dictionary<string,object> command) {
            string action=Convert.ToString(command["action"]);
            if(action=="open-menu"){
                string menu=Convert.ToString(command["menu"]);CloseViews();CloseMenus();
                if(menu=="routes")activate("courseSelectionMenuItem",1);
                else if(menu=="about")activate("aboutMenuItem",1);
                else if(menu=="sensors")activate("deviceSelectionMenuItem",1);
                else if(menu=="multiplayer")activate("joinMultiplayerRideMenuItem",1);
                else {string field=menu=="main"?"mainMenu":menu=="user"?"userSettingsSubMenu":menu=="devices"?"deviceSettingsSubMenu":menu=="workouts"?"workoutSelectionSubmenu":null;if(field==null)throw new InvalidOperationException("Menú no permitido");if(menu=="workouts")Enabled(Field("workoutSelectionSubmenuItem"));Write(Field(field),"Visible",true);}
            }
            else if(action=="close-menu"){CloseViews();CloseMenus();}
            else if(action=="browse-course"){
                RequireCourse(command);IList items=Items(CourseView,"ItemList");int next;
                if(command.ContainsKey("direction"))next=(Index(CourseView,"Index")+Convert.ToInt32(command["direction"])+items.Count)%items.Count;
                else {next=Convert.ToInt32(command["index"]);if(next<0||next>=items.Count)throw new InvalidOperationException("Recorrido fuera de la lista");if(Convert.ToString(command["key"])!=CourseKey(items[next],next))throw new InvalidOperationException("La biblioteca cambió. Actualiza la lista de recorridos");}
                Write(CourseView,"Index",next);
            }
            else if(action=="course-options"){
                RequireCourse(command);foreach(string key in new string[]{"loop","reverse"})if(command.ContainsKey(key)){object check=FieldMember(CourseView,key=="loop"?"_loopCourse":"_reverseCourse");if(!Flag(check,"Visible"))throw new InvalidOperationException("El recorrido no admite esa opción");Write(check,"Checked",(bool)command[key]);}
            }
            else if(action=="select-course"){
                RequireCourse(command);FieldInfo selected=CourseView.GetType().GetField("OnCourseSelected",I);if(selected==null||selected.GetValue(CourseView)==null)throw new InvalidOperationException("El manejador de selección no está disponible");
                CourseView.GetType().GetMethod("SelectCourseButton_OnRelease",I).Invoke(CourseView,new object[]{null,PointF.Empty,false});
            }
            else if(action=="game-toggle") {string name=Convert.ToString(command["name"]);if(!Toggles.ContainsKey(name))throw new InvalidOperationException("Ajuste no permitido");object item=Field(Toggles[name]);Enabled(item);Write(item,"Checked",(bool)command["enabled"]);}
            else if(action=="game-option") {string name=Convert.ToString(command["name"]);if(!Lists.ContainsKey(name))throw new InvalidOperationException("Ajuste no permitido");object item=Field(Lists[name]);Enabled(item);IList choices=Items(item,"Items");int index=Convert.ToInt32(command["index"]);if(choices==null||index<0||index>=choices.Count||Text(choices[index],80)!=Convert.ToString(command["label"]))throw new InvalidOperationException("La lista de ajustes cambió. Vuelve a cargarla");Write(item,"SelectedIndex",index);}
            else if(action=="game-profile") {Enabled(Field("weightMenuItem"));Enabled(Field("ftpMenuItem"));double weight=Convert.ToDouble(command["weight"]),ftp=Convert.ToDouble(command["ftp"]);if(weight<40||weight>150||ftp<50||ftp>500||double.IsNaN(weight)||double.IsNaN(ftp))throw new InvalidOperationException("Peso: 40–150 kg; FTP: 50–500 W");Type config=menus.Assembly.GetType("GTBikeV.Config",true);config.GetProperty("UserWeight",S).SetValue(null,(float)weight,null);config.GetProperty("UserFTP",S).SetValue(null,(float)ftp,null);PropertyInfo ftpLabel=menus.GetProperty("UserFTP",S);if(ftpLabel!=null)ftpLabel.SetValue(null,(float)ftp,null);}
            else throw new InvalidOperationException("Orden de menú no reconocida");
            return new Dictionary<string,object>{{"gameUi",Capture()},{"acceptedByMod",true}};
        }
    }
}
