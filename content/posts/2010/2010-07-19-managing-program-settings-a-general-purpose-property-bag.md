---
title: Managing program settings – a general purpose property bag
date: 2010-07-19 09:30:00
permalink: managing-program-settings-a-general-purpose-property-bag
uuid: 7fe44b90-1a8c-4fc2-92fa-5189a9bb8ff9
tags: Power Video Player
---

When writing a client desktop application you often need to persist user preferences. There are a number of ways to achieve that including plain text or binary or xml files, registry, or even a centralized storage on a server if your application indeed talks to a server, etc, etc.

However, for applications like [Power Video Player](http://pvp.codeplex.com/) you ultimately need just a file stored somewhere within a user’s profile (that is C:\Users\<username>\some path).

This post is not about where and how to store your settings but rather about the way for your program code to easily persist specific data and get it back from the storage.

I’m going to illustrate it on the PVP’s implementation first by showing how it was done in the past and how it has evolved into  a general purpose property bag.

I wrote first version of PVP’s Windows Forms app in 2004 with .NET 1.1\. I was learning Windows Forms with [Charles Petzold's](http://www.charlespetzold.com/)[Programming Windows with C#](http://www.charlespetzold.com/pwcs/index.html) excellent book where Charles offered an implementation of Notepad’s clone as he usually does in his books. That particular implementation featured an arguable pattern where the main application form is a result of rich inheritance where each ancestor represents a major menu item. That is, File inherits from `Form`, Edit inherits from File, View inherits from Edit, etc, etc, MyMainFrom inherits from Help.

This is debatable because there is no ‘is a’ relationship between the classes and saying that they all contribute to the whole app is kind of weak. Still, it was good for logical separation in a quick sample for a book.

The irony of the story is that this design made its way into PVP. Yes, I separated components like DirectShow wrappers, core graph building logic and so on. But I’ve built the main form as a composite inheritance tree. It survived a few refactoring rides that I took on different parts of the app and it will stay the way it is. If it ain’t broke, don’t fix it. A WPF version is already planned and this will be a more appropriate place to apply other patterns.

This little historical trip should help better understand the way PVP saved and loaded user preferences.

## Saving (before)

When the application is about to be closed a new `BinaryWriter` is created in the base form that is passed to ‘`SaveSettings`’ virtual method that is overridden in each child class. Each child class then has a chance to put anything they need into the `BinaryWriter` and then make sure to call parent’s `SaveSettings` so that the latter could save its settings too.

Here’s approximately what goes to the base class:

```
// MainFormBase.cs

protected void LoadSaveSettings(bool bLoad) 
{ 
  if (!bLoad) // saving 
  { 
      using(IsolatedStorageFileStream stream = 
        new IsolatedStorageFileStream(strConfig, 
          FileMode.Create, FileAccess.Write, storage)) 
    { 
      using(BinaryWriter writer = 
        new BinaryWriter(stream, System.Text.Encoding.Unicode)) 
      { 
        SaveSettings(writer); 
      }              
    } 
  } 
  else 
  { 
    // loading 
    ... 
  } 
}

protected virtual void SaveSettings(BinaryWriter writer) 
{ 
  // store some integers 
  writer.Write(rectNormal.X); 
  writer.Write(rectNormal.Y); 
  writer.Write(rectNormal.Width); 
  writer.Write(rectNormal.Height); 
  writer.Write((int)WindowState); 
  // store a string 
  writer.Write(strCurTheme); 
}
```

And this is the persistence code in one of the children classes called `MainFormControls` that is responsible for user interaction:

```
// MainFormControls.cs

protected override void SaveSettings(BinaryWriter writer) 
{ 
  base.SaveSettings (writer); 
  writer.Write(nVolume); 
  writer.Write(bMute); 
  writer.Write((int)wheelAction);

  BinaryFormatter formatter = new BinaryFormatter(); 
  formatter.Serialize(writer.BaseStream, htKeys); 
}
```

As you can see we first make sure to save the ancestor’s settings and then we can put our own stuff. We also use a formatter to serialize a hash table containing key bindings into the writer’s stream.

## Loading (before)

When the application starts everything is done in the same order:

The base class (`MainFormBase`) a new `BinaryReader` is created which is passed down (or up?) the inheritance tree to read stuff.

```
// MainFormBase.cs

protected void LoadSaveSettings(bool bLoad) 
{ 
  if (!bLoad) 
  { 
     // saving 
     ... 
  } 
  else // loading 
  { 
    using(IsolatedStorageFileStream stream = 
        new IsolatedStorageFileStream(strConfig, FileMode.Open, 
                   FileAccess.Read, FileShare.Read, storage)) 
    { 
      using(BinaryReader reader = 
        new BinaryReader(stream, System.Text.Encoding.Unicode)) 
      { 
        LoadSettings(reader); 
      }              
    } 
  } 
}

protected virtual void LoadSettings(BinaryReader reader) 
{ 
  int x = reader.ReadInt32(); 
  int y = reader.ReadInt32(); 
  int cx = reader.ReadInt32(); 
  int cy = reader.ReadInt32();

  int state = reader.ReadInt32(); 
  strCurTheme = reader.ReadString(); 
  // do something with read values 
  ... 
}
```

```
// MainFormControls.cs

protected override void LoadSettings(BinaryReader reader) 
{ 
  base.LoadSettings (reader); 
  nVolume = reader.ReadInt32(); 
  bMute = reader.ReadBoolean(); 
  wheelAction = (MouseWheelAction)reader.ReadInt32();

  BinaryFormatter formatter = new BinaryFormatter(); 
  htKeys = (Hashtable)formatter.Deserialize(reader.BaseStream); 
}
```

## Problems with the old approach:

*   order dependent
*   storage technology dependent

Each value must be save and read in the same order. The order must be maintained across all classes as they use the same stream. It quickly adds to a maintenance complexity.

Application code just needs to be able to save its state and restore it when the application starts. Preferably it doesn’t need to be bound to a particular persistence interface (BinaryReader and `BinaryWriter` as in this example) as you might consider replacing one in the future. It should also not be an application’s concern to instantiate formatters to serialize complex types. This is a plumbing concern.

## Enters the property bag

A property bag is a component that application code interacts with in order to store and load settings. Essentially this is a wrapper around Dictionary of type <String, Object> that allows the application to store various data under specific keys to enable the easy way to retrieve them back.

Here’s the full code:

```
public class PropertyBag 
{ 
    private IDictionary _props;

    public PropertyBag() // used when saving properties 
    { 
        _props = new Dictionary(); 
    }

    public PropertyBag(Stream stream) // used to load properties 
    { 
        BinaryFormatter formatter = new BinaryFormatter(); 
        _props = (IDictionary)formatter.Deserialize(stream); 
    }

    public void Save(Stream stream) 
    { 
        BinaryFormatter formatter = new BinaryFormatter(); 
        formatter.Serialize(stream, _props); 
    }

    public void Add(string name, T value) 
    { 
        _props.Add(name, value); 
    }

    public T Get(string name, T defaultValue) 
    { 
        object value; 
        if (_props.TryGetValue(name, out value)) 
        { 
            if (value.GetType() != typeof(T)) 
                value = defaultValue; 
        } 
        else 
            value = defaultValue; 
        return (T)value; 
    }

    public bool TryGetValue(string name, out T value) 
    { 
        bool bRet = false; 
        object o; 
        if (_props.TryGetValue(name, out o) && o.GetType() == typeof(T)) 
        { 
            value = (T)o; 
            bRet = true; 
        } 
        else 
        { 
            value = default(T); 
        }

        return bRet; 
    } 
}
```

Generic getters and setters make it really easy to load and save data of any type. The property bag also provides a serialization plumbing though the `BinaryFormatter`. This can be arguable and we might want to make the property bag accept some abstract storage interface. But perfection has no boundaries.

The consuming code now passes the `PropertyBag` instance around instead of a `BinaryWriter` or `BinaryReader`:

```
// MainFormBase.cs 
protected void LoadSaveSettings(bool bLoad) 
{ 
    IsolatedStorageFileStream stream = null; 
    try 
    { 
        IsolatedStorageFile storage = 
            IsolatedStorageFile.GetUserStoreForAssembly(); 
        if (bLoad) 
        { 
            stream = new IsolatedStorageFileStream(strConfig, FileMode.Open, 
                    FileAccess.Read, FileShare.Read, storage);

            PropertyBag props = new PropertyBag(stream); 
            LoadSettings(props); 
        } 
        else 
        { 
            PropertyBag props = new PropertyBag(); 
            SaveSettings(props);

            stream = new IsolatedStorageFileStream(strConfig, 
                FileMode.Create, FileAccess.Write, storage); 
            props.Save(stream); 
        } 
    } 
    finally 
    { 
        if (stream != null) 
            stream.Close(); 
    } 
}

protected virtual void LoadSettings(PropertyBag props) 
{ 
    int x = props.Get("pos_x", 0); 
    int y = props.Get("pos_y", 0); 
    int cx = props.Get("pos_cx", 0); 
    int cy = props.Get("pos_cy", 0); 
    int state = props.Get("window_state", (int)FormWindowState.Normal); 
    strCurTheme = props.Get("current_theme", strDefaultTheme); 
}

protected virtual void SaveSettings(PropertyBag props) 
{ 
    props.Add("pos_x", rectNormal.X); 
    props.Add("pos_y", rectNormal.Y); 
    props.Add("pos_cx", rectNormal.Width); 
    props.Add("pos_cy", rectNormal.Height); 
    props.Add("window_state", (int)WindowState);

    props.Add("current_theme", strCurTheme); 
}
```

It’s still up to you to set up the stream or even enhance the `PropertyBag`and implement some abstract storage interface. Still, this solution broke the dependency of our application code on a particular storage interface (binary readers and writers) and on a particular order in which settings must be saved and loaded.

We have also solved a problem when a newer version of the applications reads the setting file stored by an older version that had less properties. The `PropertyBag`allows you to easily provide default values.