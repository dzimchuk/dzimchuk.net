---
title: WPF skin engine – part 2
date: 2011-07-11T05:57:00.000Z
lastmod: 2015-04-23T16:54:57.000Z
permalink: wpf-skin-engine-part-2
uuid: 5d538657-8986-482a-a9bf-374c8f7ddaac
tags: WPF
---

This is a follow-up post to the [previous one](WPF-skin-engine-part-1) about the Skinner library. In this post I want to focus on a few technical peculiarities of the library and explain why certain things were done the way they were done.

## Loading a skin

I already mentioned that Skinner does scanning for available skins on a separate thread and in a dedicated domain that it shuts down when scanning is over. It insures we don’t keep potentially large number of assemblies in the main application’s domain and it also helps us implement a sort of a hot pluggability, when you can add/remove skin assemblies at runtime and refresh the list of available skins by calling `ISkinManager.Scan()` again.

My initial desire was also to load a chosen skin through a dedicated domain. Here’s how you might have implemented it:

```
internal class Loader : MarshalByRefObject
{
    public static LoadResult Load(Uri packUri)
    {
        LoadResult result = new LoadResult();
        AppDomain domain = null;
        Stream stream = null;

        try
        {
            domain = 
              AppDomain.CreateDomain("Skinner.Loader.Domain");
            Loader loader = 
              (Loader)domain.CreateInstanceAndUnwrap(
                     Assembly.GetExecutingAssembly().FullName,
                     typeof(Loader).FullName);

            stream =  GetStream(packUri);
            result.SkinResourceDictionary = Load(stream);
        }
        catch (Exception e)
        {
            result.Error = e;
        }
        finally
        {
            if (stream != null)
                stream.Dispose();
            if (domain != null)
                AppDomain.Unload(domain);
        }

        return result;
    }

    private static ResourceDictionary Load(Stream stream)
    {
        // details are omitted
    }

    private Stream GetStream(Uri packUri)
    {
        var streamInfo = Application.GetResourceStream(packUri);
        return streamInfo.Stream;
    }
}
```

So we instantiate an instance of the loader in another domain and call `GetStream(Uri packUri)` through remoting. Getting a resource dictionary from a stream can be done with `Baml2006Reader`:

```
private static ResourceDictionary Load(Stream stream)
{
    var reader = new Baml2006Reader(stream);
    return (ResourceDictionary)XamlReader.Load(reader);
}
```

However, `Baml2006Reader` is available in .NET 4 so if we needed to target earlier versions we could resort to the known undocumented way that boils down to calling an internal static `LoadBaml` method on `XamlReader`<span style="font-family: Calibri;">through reflection:</span>

```
private static ResourceDictionary Load(Stream stream)
{
    var pc = new ParserContext();
    var readerType = typeof(System.Windows.Markup.XamlReader);
    var method = readerType.GetMethod("LoadBaml", 
       BindingFlags.NonPublic | BindingFlags.Static);
    return (ResourceDictionary)method.Invoke(null, 
       new object[] { stream, pc, null, false });
}
```

The abstract `Stream` class derives from `MarshalByRefObject` and we might have expected that WPF’s implementation supported remote calls. However, it doesn’t. Although the proxy is successfully created it can’t be used to read BAML.

Running that code in the current domain without remoting works great. However, in this case it’s preferable to use a convenient `Application.LoadComponent` method that takes a relative pack Uri and returns a `ResourceDictionary` instance to you. This is how Skinner ultimate loads resource dictionaries.

Note that for this to work, XAML that is references by the pack Uri is expected to have the `ResourceDictionary` element as it root.

## Resolving resource location

`Application.LoadComponent` method expects a relative Uri. As a skin’s resource is located in a different assembly than Skinner, that relative Uri must contain the skin’s assembly name.

However, when you specify a Uri in the `SkinDescription` you can omit the assembly name. Skinner will kindly reformat your Uri and actually send a normalized version in `SkinFound` event.

One more important thing is physical skins’ assemblies location. Skinner uses MEF for scanning and configures the composition container to scan in the main application’s directory (`AppDomain.CurrentDomain.SetupInformation.ApplicationBase`) as well as in the special ‘skins’ directory that is located under the main application’s directory. I think it’s sufficient for most purpose but if for any reason you don’t like this convention you can always update Skinner to meet your requirements.

Still, when you place skins’ assemblies under ‘skins’ directory the default assembly resolution will fail. Skinner addresses this by reacting to `AppDomain.AssemblyResolve` event and trying to load a requested assembly from the ‘skins’ subdirectory:

```
internal class SkinManager : ISkinManager
{
    private readonly Regex _regexAssemblyName = 
       new Regex(@"^(?<name>.+),.+$");
    private readonly Regex _regexAssemblyResources = 
       new Regex(@"^[^\.]+\.resources");

    public SkinManager()
    {
        AppDomain.CurrentDomain.AssemblyResolve += 
            (sender, args) =>
            {
                return ResolveAssembly(args.Name);
            };
    }

    private Assembly ResolveAssembly(string name)
    {
        Assembly assembly = null;

        try
        {
            string assemblyName = GetAssemblyFileName(name);
            if (!string.IsNullOrEmpty(assemblyName))
                assembly = 
                   Assembly.LoadFrom(GetAssemblyFileName(name));
        }
        catch { }

        return assembly;
    }

    private string GetAssemblyFileName(string name)
    {
        if (_regexAssemblyResources.IsMatch(name))
            return null; // ignore additional requests for 
                         // AssemblyName.resources

        string assmeblyName = name;
        Match m = _regexAssemblyName.Match(name);
        if (m.Success)
            assmeblyName = m.Groups["name"].Value;

        // try to find an assembly in the 'skins' subdirectory
        string dir = 
           Path.Combine(AppDomain.CurrentDomain.
              SetupInformation.ApplicationBase, "skins");

        string assumedAssembly = 
            Path.Combine(dir, 
               string.Format("{0}.dll", assmeblyName));

        if (!File.Exists(assumedAssembly))
        {
            try
            {
                var matchedFiles = 
                    Directory.GetFiles(dir, 
                        string.Format("{0}.*", assmeblyName));
                if (matchedFiles.Length > 0)
                    assumedAssembly = matchedFiles[0];
            }
            catch { }
        }

        return assumedAssembly;
    }
}
```

If the missing assembly is TestSkins2 (the actual file can be TestSkin2.dll but it can be an .exe just as well) its name will come in the form of ‘TestSkins2, Culture=neutral’. However, we need to pass a concrete file name to `Assembly.LoadFrom` so we do our best to find one.