---
title: Ouch! CallbackOnCollectedDelegate was detected.
date: 2010-09-03 03:28:00
permalink: ouch-callbackoncollecteddelegate-was-detected
uuid: 00423ab7-1fff-48de-b8f8-35c3da14c83c
tags: Tips & Tricks
---

I was in the middle of refactoring of the core component of my [Power Video Player](http://pvp.codeplex.com/) when I hit this error during a test run. It said the following:

> A callback was made on a garbage collected delegate of type 'napi!Dzimchuk.Native.WindowsManagement+WndProc::Invoke'. This may cause application crashes, corruption and data loss. When passing delegates to unmanaged code, they must be kept alive by the managed application until it is guaranteed that they will never be called.

I actually decided to replace a native media window (i.e. the window that DirectShow renderers paint video on) with… well another native window that is wrapped however with the managed code. It can’t depend on any presentation technology like Windows Forms or WPF, thus it’s just a bunch of PInvoke wrapped nicely in a C# class.

Also, the idea is to create a this window each time a new video is rendered and destroy it when a user closes the video. So, obviously creation of the window is done in the constructor of my new wrapper however before you create it you need to register a window class. i could have done it each time I wanted to created the window but I thought it would be cleaner to register the window class once in the static constructor:

```
private const string WINDOW_CLASS_NAME = "PVP_MEDIA_WINDOW";

static DefaultMediaWindow()
{
    WindowsManagement.WNDCLASSEX wcex = 
        new WindowsManagement.WNDCLASSEX();
    wcex.cbSize = (uint)Marshal.SizeOf(wcex);
    wcex.style = (uint)(WindowsManagement.ClassStyles.CS_HREDRAW |
                        WindowsManagement.ClassStyles.CS_VREDRAW |
                        WindowsManagement.ClassStyles.CS_DBLCLKS);
    wcex.lpfnWndProc += WndProc;
    wcex.cbClsExtra = 0;
    wcex.cbWndExtra = 0;
    wcex.hInstance = IntPtr.Zero;
    wcex.hIcon = IntPtr.Zero;
    wcex.hCursor = 
        WindowsManagement.LoadCursor(IntPtr.Zero, 
        WindowsManagement.IDC_ARROW);
    wcex.hbrBackground = IntPtr.Zero;
    wcex.lpszMenuName = null;
    wcex.lpszClassName = WINDOW_CLASS_NAME;
    wcex.hIconSm = IntPtr.Zero;

    WindowsManagement.RegisterClassEx(ref wcex);
}
```

We need to provide a window procedure callback as part of the `WNDCLASSEX` structure as we do it in the static constructor the procedure must be a static method too.

But we are creating a wrapper that encapsulates some logic and we would like to have a class member to act as a window procedure. Thus we need the static procedure to delegate the work on a particular instance procedure. Here’s the solution I chose:

```
private static IDictionary<IntPtr, WindowsManagement.WndProc> 
    _procs = new Dictionary<IntPtr, WindowsManagement.WndProc>();

private static IntPtr WndProc(IntPtr hWnd, uint msg, 
                              IntPtr wParam, IntPtr lParam)
{
    WindowsManagement.WndProc proc;
    if (_procs.TryGetValue(hWnd, out proc))
       return proc(hWnd, msg, wParam, lParam);
    else
    {
       Debug.Fail("WndProc called for hWnd that wasn't reg'd.");
       return 
       WindowsManagement.DefWindowProc(hWnd, msg, wParam, lParam);
    }
}

public DefaultMediaWindow(IntPtr hwndParent)
{
    // simplified...
    _hwnd = CreateWindow(hwndParent);
    _procs.Add(_hwnd, OnWndProc);
}
```

So I just store instance delegates in a static dictionary which makes it easy for the static window procedure to dispatch messages to concrete windows.

When the window is disposed it’s procedure is removed from the dictionary:

```
private void Dispose(bool disposing)
{
    // no matter what, destroy the handle
    if (_hwnd != IntPtr.Zero)
    {
        Debug.Assert(_procs.ContainsKey(_hwnd), 
            "Handle wasn't found in the inernal collection.");
        _procs.Remove(_hwnd);
        Debug.Assert(!_procs.ContainsKey(_hwnd), 
            "Handle wasn't removed from the inernal collection.");

        WindowsManagement.DestroyWindow(_hwnd);
        _hwnd = IntPtr.Zero;
    }
}
```

Ok, so this code is buggy. It gives you this ‘CallbackOnCollectedDelegate was detected’ error when your window starts receiving messages. It happens pretty soon. Can you spot the buggy part?

It’s actually in the static constructor:

```
static DefaultMediaWindow()
{
    ...
    wcex.lpfnWndProc += WndProc;
    ...
    WindowsManagement.RegisterClassEx(ref wcex);
}
```

`WndProc`  delegate is eligible for garbage colleciton right after it’s been passed to the unmanaged world with `RegisterClassEx`. It’s no longer referenced anywhere in the managed code.

The fix is ridiculously easy. You just need to keep a reference to `WndProc`:

```
private static WindowsManagement.WndProc _global_wnd_proc = WndProc;

static DefaultMediaWindow()
{
    ...
    wcex.lpfnWndProc += _global_wnd_proc;
    ...

    WindowsManagement.RegisterClassEx(ref wcex);
}
```

Lesson learned. Have a nice day!