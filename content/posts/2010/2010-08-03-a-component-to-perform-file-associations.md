---
title: A component to perform file associations
date: 2010-08-03T06:03:00.000Z
lastmod: 2015-04-23T17:45:11.000Z
permalink: a-component-to-perform-file-associations
uuid: 4a64fb41-5c69-409d-9df8-d1f35edab78e
tags: Windows Programming
---

Sometimes we need to do file associations with our desktop applications so that when a user clicks on  a file in the explorer it gets opened with our application. This is a common task and it is documented in MSDN so I’m not going to explain it all again.

Instead, I will describe a component I wrote for [Power Video Player](http://pvp.codeplex.com) that can perform file associations on pre-Vista systems as well as with the ‘Default Programs’ feature (Vista+ systems). It will also take care of restoring the previous associations when you need to un-associate a file or when you uninstall your application.

## Pre-Vista days

On pre-Vista systems to associate a file with your application was about creating a document type in either HKEY_CLASSES_ROOT or in HKEY_LOCAL_MACHINE\Software\Classes and then pointing a particular extension to your document type by setting the default value of an extension key in HKEY_CLASSES_ROOT to the name of your document type. The document type itself contains information about what command to launch when the file is clicked in the explorer.

Confused? Don’t be. Here’s a [quick and good example.](http://msdn.microsoft.com/en-us/library/cc144158(VS.85).aspx)

## Default Programs (Vista+)

The previous approach won’t work well on Vista and more modern OS’s. On these system a new mechanism was introduced that is called Default Programs. The idea is to organize the way different applications do file associations and provide a consistent UI for a user to control associations.

For a complete reference see [Default Programs.](http://msdn.microsoft.com/en-us/library/cc144154(v=VS.85).aspx) 

As programmers we are interested in programmatic ways to do tasks and Default Programs provide to COM interfaces:

*   `IApplicationAssociationRegistrationUI`
*   `IApplicationAssociationRegistration`

Of course you can still hack the registry directly but now it’s a bit more tedious than it used to be. I suggest staying with the official way.

`IApplicationAssociationRegistrationUI` allows you to spawn a standard dialog box like the one shown in the MSDN article above. This may be a good option in some cases when it comes in line with the overall look and feel of your application. And hey, it shaves a few hours off your development effort  as you don’t have to implement the UI yourself.

However, in PVP I have my own file association page as part of the user preferences dialog so I went for `IApplicationAssociationRegistration`.

## The FileAssociator component

The component consists of 2 classes: `FileAssociator` and `FileAssociatorW6`.

They are available for download as part of PVP source code, just go to [PVP source code](http://pvp.codeplex.com/SourceControl/list/changesets) to grab the latest version. You will find the component in <solution dir>\pvp\Util directory.

`IApplicationAssociationRegistration` is defined in ‘napi’ assembly which is also available as part of the source code package. I created this assembly as a place to define PInvoke stuff. You might find it useful as it defines various WinAPI functions, types and structures that you might need someday.

## Usage

There are several key points to mention:

*   Setting up or registering an application
*   Associating and un-associating file types
*   Tearing down or unregistering the application

## Application registration

Before you can perform file associations you need to put certain information into the system registry namely properly register with Default Programs by putting certain records under HKEY_LOCAL_MACHINE\Software and create document (program) types for pre-Vista associations.

As we need write access to HKEY_LOCAL_MACHINE the program needs elevated permission under Vista+ systems. Normally programs don’t run in the elevated mode unless a user disabled the UAC or explicitly started a program as administrator.

The optimum place where you can perform registration is at install time. Installers usually already run elevated as they need to put stuff into the registry, on drive C:, etc, etc.

In PVP I use standard MS installer and I added a custom Installer class to my project. The custom installer overrides Install and Uninstall methods which get called at install and uninstall times appropriately. This is where I can perform one-time actions that require elevated permissions.

So here’s the registration code:

```
public static void HandleRegApp()
{
    if (IsAdmin)
    {
        CultureInfo ci = new CultureInfo("en-US");
        Thread.CurrentThread.CurrentCulture = ci;
        Thread.CurrentThread.CurrentUICulture = ci;

        string strExe = Assembly.GetExecutingAssembly().Location;
        string command = "\"" + strExe + "\"";
        string icon = strExe + ",0";

        string appName = Resources.Resources.program_name;
        string appDescription = 
           Resources.Resources.program_description;

        using (FileAssociator fa = 
               FileAssociator.GetFileAssociator(strDocTypePrefix, 
                                                strProgName))
        {
            fa.Register(@"Software\Clients\Media", 
                        icon, 
                        command, 
                        appName, 
                        appDescription, 
                        GetTypesInfo());
        }
    }
    else
    {
        Elevate("-regapp");
    }
}
```

There is an extra check for the elevated mode as registration can be run outside of the installer. PVP provides a command line switch that allows you re-register it. I will not dive into how you can force elevation, I think I’ll writer another blog post to cover it.

`FileAssociator` provides a convenient static method `GetFileAsociator` that will check the version of the operating system you are running and return a proper implementation of the component. Note that I’m calling it from within `using` block as Vista+ versions (that is `FileAssociatorW6`) needs to dispose of the `IApplicationAssociationRegistration`.

The registration code is self-explaining for the most part however there are a few arguments that I would like to elaborate upon:

_strDocTypePrefix_

This is a prefix that will be used to define document (program) types that your application claims to be allowed to be associated with. Say you want to be able to associate with “.doc” extension. The following document type will be created under HKEY_LOCAL_MACHINE\Software\Classes : _strDocTypePrefix.DOC_. And this type will be used to define a file association capability with Default Programs.

_"Software\Clients\Media"_

This is a registry path relative to HKEY_LOCAL_MACHINE that will be used to store registration information for Default Programs. You can choose a different path like ‘Company name\Product name’ or anything else. I just followed a pattern used by other media applications including the Windows Media Player.

_GetTypesInfo()_

This is how you provide information about what extensions your application can be associated with and what commands to run per each extension.

There is a DocTypeInfo class that wraps this information for each file extensions. Here’s how I define a collection of file types in PVP:

```
private static IList<FileAssociator.DocTypeInfo> GetTypesInfo()
{
    string strExe = Assembly.GetExecutingAssembly().Location;
    string command = "\"" + strExe + "\" \"%L\"";
    string icon = strExe + ",0";

    IList<FileAssociator.DocTypeInfo> types = 
         new List<FileAssociator.DocTypeInfo>();

    IList<FileType> ts = Dzimchuk.PVP.FileTypes.GetFileTypes();
    foreach (FileType t in ts)
    {
        types.Add(new FileAssociator.DocTypeInfo(t.Extension, 
          t.Description.Substring(t.Description.IndexOf('-') + 2), 
          icon, 
          command, 
          command, 
          true));
    }

    return types;
}
```

Some might ask: “why do I need to provide commands and icons for each type when I already provided this information to `FileAssociator.Register(…)` method?". This is a valid question and you are free to refactor, though this info actually belongs to file (document) types and you may need to provide different commands or icons for each file type.

What you pass to   `FileAssociator.Register(…)` describes your application. DocTypeInfo describes file types.

Hm… wait, there are some FileType and FileTypes classes. What role do they play? They are auxiliary classes used to keep supported file extensions in one place and access this info where needed (registration, dialog, etc):

```
internal class FileType
{
    public string Extension;
    public string Description;
    public FileType(string description, string extension)
    {
        Extension = extension;
        Description = description;
    }
}

internal static class FileTypes
{
    public static IList<FileType> GetFileTypes()
    {
        IList<FileType> types = new List<FileType>();
        types.Add(new FileType(Resources.Resources.file_type_asf, 
           ".asf"));
        types.Add(new FileType(Resources.Resources.file_type_avi, 
           ".avi"));

        // other types are omitted

        return types;
    }
}
```

## Associating files

The tough part is done, we are registered. Now we can easily associate and un-associate file types with our application.

Determining what types we are already associated with and pass this info to our custom dialog box:

```
using (FileAssociator fa = 
       FileAssociator.GetFileAssociator(strDocTypePrefix, 
                                        strProgName))
{
    string[] types = dlg.FileTypes;
    Hashtable table = new Hashtable();
    foreach (string type in types)
        table[type] = fa.IsAssociated(type);
    dlg.SelectedFileTypes = table;
}
```

When OK is clicked and a user changed some file association we detect it and use the `FileAssociator` to do its job:

```
private void OnSettingsApply(object sender, EventArgs e)
{
    if (dlg.FileTypesChanged)
        AssociateFiles(dlg);
}

private void AssociateFiles(SettingsForm dlg)
{
    using (FileAssociator fa = 
           FileAssociator.GetFileAssociator(strDocTypePrefix, 
                                            strProgName))
    {
        Hashtable table = dlg.SelectedFileTypes;
        foreach (DictionaryEntry entry in table)
            fa.Associate(entry.Key.ToString(), (bool)entry.Value);
    }

    FileAssociator.NotifyShell();
}
```

Basically we pass an extension and a `Boolean` value to `FileAssociator,Associate(…)` method. Passing `True` means we want to associate with an extension and correspondingly `False` indicates we want to remove an association. The extension we pass to this method must start with a dot.

File associations are done on per-user bases, i.e. the information will be put under HKEY_CURRENT_USER on pre-Vista system and Default Programs also create per-user file associations.

Writing to HKEY_CURRENT_USER or calling methods on `IApplicationAssociationRegistration` do not require elevated permissions.

An additional added value brought by the `FileAssociator` is that it will backup the information about the previous document (program) type that an extension was associated with so it is possible to restore the association when a user decides to un-associate the program or when she uninstalls our application.

## Unregistering

You do it at uninstall time:

```
public static void HandleUnRegApp()
{
    if (IsAdmin)
    {
        using (FileAssociator fa = 
               FileAssociator.GetFileAssociator(strDocTypePrefix, 
                                                strProgName))
        {
            fa.Unregister();
        }
    }
    else
    {
        Elevate("-unregapp");
    }
}
```

It will remove all associations and the component will try to restore previous associations. The default programs will even try to determine a matching application of the information about previous association is missing for some reason or an application that an extension used to be associated with had been removed.

It will then remove all document types from the registry and all information it added for Default Programs.

You might have noticed I relied on some PVP-specific classes in the code samples, that’s because I need to provide my own UI and I need to be able to pass the association information to and from the UI.

You might prefer to use the UI provided by Vista+ systems through the `IApplicationAssociationRegistrationUI` interface. Still, you need to do registration and un-registration anyway. And this is where you might find the component still useful to you.