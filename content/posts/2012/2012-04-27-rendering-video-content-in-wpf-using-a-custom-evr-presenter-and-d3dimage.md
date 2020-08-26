---
title: Rendering video content in WPF using a custom EVR presenter and D3DImage
date: 2012-04-27 23:06:00
permalink: rendering-video-content-in-wpf-using-a-custom-evr-presenter-and-d3dimage
uuid: 89ceb76a-2a2f-49a7-9f71-e46dc7336af5
tags: WPF, DirectShow
---

### Preface

> <span style="text-decoration: underline;">Note:</span> if you’re not interested in low level control on your DirectShow graph and don’t need to render DVD content, just stick to `MediaElement` or `VideoDrawing+MediaPlayer`. This post is about how to render video yourself in your own filter graph.

I was thinking about porting Power Video Player to WPF long ago and was gathering necessary information that would help cut tough corners for a while. One of the things that I thought was absolutely clear is the way I was going to port the core engine part that relies heavily on PInvoke and native windows management. I didn’t even imagine how much I was wrong.

The basic mechanism that the core’s been using to present the video consists of creating a native window that’s made a child of some managed container (say `UserControl`) and passing its HWND to one of the renderers. While the core was doing quite a job managing sizing and aspect ration handling it was completely up to the stock renderer (and PVP supported VMR, VMR9, both windowless and not, EVR and even the legacy VideoRenderer) to actually draw the picture on the window (ok, windowed renderers create their own windows on top of yours but never mind, the PVP engine is able to handle all the gory details).

So the initial idea was to retain that very mechanism once WPF provides convenient `HwndHost` component that can host any native window. `HwndHost` is actually a `FrameworkElement` so it naturally fits into WPF elements’ tree (it does however have implications in terms of mouse and keyboard events handling but this is the least important problem).

> Edited: On another thought, not too least. What about touch? WPF 4 has first class support for touch but `HwndHost` is an interop layer to the legacy technology and is restrictive in various ways as you’re going to see soon.

Well, it works. Under certain circumstances, however. Basically, it’s going to work as long as you don’t try to make your main window look different from the standard window. You know, in order to remove the ugly default thick border and make your window skinned (which is a common requirement for a video play application) you have to set `WindowStyle` to `None` and `Background` to `Transparent`. But what’s essential is that you have to set `AllowsTransparency` property of your window to True. And once you’ve done that, your `HwndHost` becomes invisible (not black, green or white, but totally transparent). And anything that’s drawn by its children is invisible too.

This odd behavior made me spend some time investigating and experimenting and in the end it turned out to be a known issue, I like [this thread for an explanation](http://social.msdn.microsoft.com/forums/en-US/wpf/thread/6f9dd3b5-af92-4076-9b4e-1a770dd52f70/). So once you enable WPF’s transparency you start using the new mechanism that is incompatible with Win32 standard one. Among the proposed advises there are:

*   Don’t host legacy child HWND controls.  Try to find a WPF equivalent.
*   Write a WPF equivalent of the HWND control (HTML content seems to be a popular request).
*   Don’t use per-pixel alpha.  Consider applying a HREGION instead.
*   Place your HWND control in a regular top-level window that has the app window as its owner.  Position the control window where you want it.
*   Use a timer and call Win32’s PrintWindow (or send a WM_PRINT) to capture the HWND control to a bitmap, and display that bitmap in WPF.
*   Try to wrap the containing window in a WS_EX_COMPOSITED window and respond to WM_PAINT to capture a bitmap and display the bitmap in WPF.
*   Hook the HWND control’s window proc and respond to WM_PAINT by capturing the bitmap and displaying it in WPF.

All suggestions make sense and can applied when appropriate. Last 3 items, for example, are perfectly suitable for people who want to display legacy stuff on some fancy tooltips… They didn’t, however, give a direct or indirect solution to my situation, but… They actually gave me a hint. No, not just a hint. They opened my eyes and made me reconsider my priorities. Do I want to carry the burden supporting legacy platforms in my library? What benefits do I get? What if I leave my legacy stuff as is and set out exploring something new?

## The new solution

As WPF uses DirectX for rendering and video renderers also use DirectX I had a feeling it should be possible to somehow make the renderers communicate with WPF. I even spent an evening learning how to do 3D drawing in WPF as I thought it might get me closer to what I was looking for.

However, I soon came to realize that WPF manages its own Direct3D surfaces and you can’t easily access them from outside. But, there is one useful component called D3DImage which allows us to provide an arbitrary Direct3D surface to WPF and the latter would copy its content to its own surfaces.

I’ve found walkthrough articles available on MSDN really useful to understand how to properly use D3DImage. I encourage you to take a look at them too: [Creating Direct3D9 Content for Hosting in WPF](http://msdn.microsoft.com/en-us/library/cc656716.aspx) and [Hosting Direct3D9 Content in WPF](http://msdn.microsoft.com/en-us/library/cc656785.aspx).

The second essential part of the solution is to somehow grab video frames from the renderer and pass them to D3DImage. Both VMR and EVR can be extended with a customer presenter that is actually responsible for managing DirectX stuff and actually presenting the frames. As EVR is the preferred video renderer on Vista and Windows 7 (and it will be on Windows 8 as it is the renderer that Media Foundation uses) I put my attention to it.

By the way I added support for EVR to PVP about 2.5 years ago and I remembered issues I had with its default presenter that didn’t properly update the areas of the media window surrounding the destination rectangle. The solution I came with by then was to resize the media window to fit the destination rectangle. Digging deeper and providing my own custom presenter seemed like an overkill. And it was.

However, Microsoft provided a sample of the custom EVR presenter and a description on [How to Write an EVR Presenter](http://msdn.microsoft.com/en-us/library/windows/desktop/bb530107(v=vs.85).aspx). If you’re really interested in the topic I highly recommend you spend some time with this lengthy article. The presenter provided in the sample doesn’t fully implement `IMFVideoDisplayControl` but overall is a good starting point for your own implementation as its `D3DPresentEngine` class is designed to be extended (that is, subclassed) and it provides a bunch of essential virtual functions for you to override.

In a nutshell the presenter maintains two queues of video sample objects and each of them has an underlying Direct3D surface. The first queue contains ‘free’ samples that are fed to video mixer to actually draw frames on their surfaces. EVR notifies the presenter when it needs to provide a sample to the mixer.

Once the mixer finishes drawing the frame on the surface, the sample is put into another queue. That second queue contains samples that are ready to be presented at specified timestamps. The queue is managed by the special component of the presenter called scheduler that monitors the queue on a separate thread. Once it’s time to present a sample the scheduler calls `D3DPresentEngine` passing it the sample. The way the sample is actually presented is the responsibility of `D3DPresentEngine` and this is where we fit in as we are able to override presentation details by subclassing `D3DPresentEngine`.

I gave you this short description so that the rest of the post would make sense to you. There are a lot of subtle details like implementing various interfaces that are needed to properly interact with EVR, managing repaints, returning presented samples to the first queue, etc. Once again, if you’re interested in the topic I encourage you to study the article on MSDN and follow its description in the code sample.

> Note, there is open source project called [Media Foundation .Net](http://mfnet.sourceforge.net/) that ported the sample to managed code. I didn’t try it though as I was concerned about performance of too frequent interactions between EVR and the managed presenter. However, you might be interested in trying it out. Still, I stuck to the native C++ Microsoft sample.

> Another note: there is well known [WPF MediaKit project](http://wpfmediakit.codeplex.com/) that uses the same approach but in a special way. I’m going to get to it later in this post but I have to say looking at the sample provided on the project’s page kind of assured me that the whole idea was worth investing my time into it.

## Initial approach

Looking at `D3DPresentEngine` you would notice it stores a pointer to Direct3D surface of the most recent sample in a private variable called `m_pSurfaceRepaint`. Moreover, it increments a reference count on it effectively preventing the sample from returning to the first queue (thanks to `IMFTrackedSample` interface, yes, please check out the MSDN article).

It needs `m_pSurfaceRepaint` to be able to repaint the last frame in response to `IMFVideoDisplayControl->Repaint()` which can be called (and is recommended to be called) when a video window receives WM_PAINT message.

And this is actually the frame that we want to pass to D3DImage. However, here’s a gotcha. The surface pointed to by `m_pSurfaceRepaint` belongs to the sample that can be fed to the mixer any time so that it draws another frame on it. So it can’t be safely used as a back buffer for D3DImage. Instead, we want to maintain our own surface, called ‘return’ surface and copy the content of the most recent frame to it when the most recent frame changes.

So in our derived class (let’s call it `PvpPresentEngine`) we override `OnCreateVideoSamples` function that is called by D3DPresentEngine whenever it recreates video samples which can happen due to variety of reasons. Note that before recreating samples it calls `OnReleaseResources()` which we should also override to delete previous Direct3D resource that we might have allocated.

```
void PvpPresentEngine::OnReleaseResources()
{
    SafeRelease(&m_pReturnSurface);
    SafeRelease(&m_pRecentSurface);
}

HRESULT PvpPresentEngine::OnCreateVideoSamples(
                            D3DPRESENT_PARAMETERS& pp)
{
    int hr = this->m_pDevice->CreateRenderTarget(
                                 pp.BackBufferWidth, 
                                 pp.BackBufferHeight, 
                                 pp.BackBufferFormat, 
                                 pp.MultiSampleType, 
                                 pp.MultiSampleQuality, 
                                 true, 
                                 &m_pReturnSurface, 
                                 NULL);

    return hr;
}
```

We are passed a reference to `D3DPRESENT_PARAMETERS` structure so we know the configuration of D3D surface to create (we want our ‘return’ surface to be fully compatible with the surfaces of video samples that the presenter maintains in its two queues). Whenever it recreates its sample we’re going to recreate our return surface.

You might have noticed a pointer to some recent surface (`m_pRecentSurface`). What is it? It’s actually a pointer to the same most recent frame/surface (`m_pSurfaceRepaint`) but we maintain our own copy of the pointer. We receive it in the overridden `PresentSwapChain` function:

```
HRESULT PvpPresentEngine::PresentSwapChain(
                        IDirect3DSwapChain9* pSwapChain, 
                        IDirect3DSurface9* pSurface)
{
    EnterCriticalSection(&m_ObjectLock);

    if (m_pRecentSurface != pSurface)//'borrow' the latest surface
    {
        CopyComPointer(m_pRecentSurface, pSurface);
        m_bNewSurfaceArrived = TRUE;
    }

    LeaveCriticalSection(&m_ObjectLock);
    return S_OK;
}
```

`CopyComPointer` increments a reference count on the new pointer and decrements it on the old one. This is a pretty convenient function that helps us keep the surface from being returned to the queue of available ones:

```
template <class T>
void CopyComPointer(T* &dest, T *src)
{
    if (dest)
    {
        dest->Release();
    }
    dest = src;
    if (dest)
    {
        dest->AddRef();
    }
}
```

We also use a critical section as `PresentSwapChain` is called on the scheduler’s thread while we consume the surface on WPF’s composition thread.

On WPF’s end we subscribe to `CompositionTarget.Rendering` event and try to get the latest surface there:

```
private void CompositionTarget_Rendering(object sender, 
                                         EventArgs e)
{
    RenderingEventArgs args = (RenderingEventArgs)e;

    // It's possible for Rendering to call back twice 
    // in the same frame 
    // so only render when we haven't already rendered 
    // in this frame.

    if (_d3dImage.IsFrontBufferAvailable && 
        _lastRender != args.RenderingTime)
    {
        bool newSurfaceArrived;
       _pvpPresenter.HasNewSurfaceArrived(out newSurfaceArrived);
        if (newSurfaceArrived)
        {
            _d3dImage.Lock();

            IntPtr pSurface;
            _pvpPresenter.GetBackBufferNoRef(out pSurface);

            if (pSurface != null)
            {
                // Repeatedly calling SetBackBuffer with the 
                // same IntPtr is a no-op. 
                // There is no performance penalty.
                _d3dImage.SetBackBuffer(
                      D3DResourceType.IDirect3DSurface9, 
                      pSurface);

                _d3dImage.AddDirtyRect(
                      new Int32Rect(0, 
                                    0, 
                                    _d3dImage.PixelWidth, 
                                    _d3dImage.PixelHeight));
            }

            _d3dImage.Unlock();
        }

        _lastRender = args.RenderingTime;
    }
}
```

This C# part pretty much mimics the sample available [at MSDN](http://msdn.microsoft.com/en-us/library/cc656785.aspx). `_pvpPresenter` is a reference to RCW over my native presenter.

It’s important to note that we first check if a new frame is available and only if it is we lock D3DImage in order give it new content. We do the rendering right in `GetBackBufferNoRef()` and we confirm to D3DImage recommendation to render on the back buffer only when it’s locked.

As to the native implementation it is as follows:

```
HRESULT PvpPresentEngine::HasNewSurfaceArrived(
                                     BOOL *newSurfaceArrived)
{
    EnterCriticalSection(&m_ObjectLock);

    *newSurfaceArrived = m_bNewSurfaceArrived;

    LeaveCriticalSection(&m_ObjectLock);
    return S_OK;
}

HRESULT PvpPresentEngine::GetBackBufferNoRef(
                               IDirect3DSurface9 **ppSurface)
{
    EnterCriticalSection(&m_ObjectLock);

    HRESULT hr = S_OK;
    *ppSurface = NULL;

    if (m_bNewSurfaceArrived && m_pRecentSurface != NULL)
    {
        hr = D3DXLoadSurfaceFromSurface(m_pReturnSurface,
                                        NULL,
                                        NULL,
                                        m_pRecentSurface,
                                        NULL,
                                        NULL,
                                        D3DX_FILTER_NONE,
                                        0);

        m_bNewSurfaceArrived = FALSE;

        if (SUCCEEDED(hr))
        {
            *ppSurface = m_pReturnSurface;
        }
    }

    LeaveCriticalSection(&m_ObjectLock);
    return hr;
}
```

As you can see we again have to lock before we copy the latest fame to `m_pReturnSurface` and return the latter to WPF because the latest surface may be swapped any time by the presenter’s scheduler thread.

Although we try not to waste resources and don’t copy the buffers if no new recent frame has arrived (this is achieved with a simple `m_bNewSurfaceArrived` flag and an extra `HasNewSurfaceArrived` call), there is still a lot thread locking going on which results in dropped frames. For instance, the presenter thread can’t swap the latest frame while we are still copying and returning the previous one to D3DImage. And at the same time the presenter keeps adding new ready sample to the scheduler’s queue. However, when the scheduler’s thread is unlocked again it sees that queued frames have missed their presentation time and it needs to go on and drop them.

## Second attempt

To minimize the influence of locking let’s introduce two additional queues and a pool of return surfaces. The pools will consist of 3 or 4 surfaces that will be stored in either queue. The first queue (called `m_AvailableSurfaces`) will contain surfaces available for rendering on by the scheduler’s thread. The second queue (called `m_RenderedSurfaces`) will contain surfaces that are ready to be sent to D3DImage.

Here’s how the initialization part has transformed:

```
void PvpPresentEngineQueued::OnReleaseResources()
{
    m_RenderedSurfaces.Clear();
    m_AvailableSurfaces.Clear();

    SafeRelease(&m_pReturnSurface);
}

HRESULT PvpPresentEngineQueued::OnCreateVideoSamples(
                                  D3DPRESENT_PARAMETERS& pp)
{
    HRESULT hr = S_OK;

    for(int i = 0; i < 4; i++)
    {
        IDirect3DSurface9 *pSurface = NULL;
        int hr = this->m_pDevice->
                CreateRenderTarget(pp.BackBufferWidth, 
                                   pp.BackBufferHeight, 
                                   pp.BackBufferFormat, 
                                   pp.MultiSampleType, 
                                   pp.MultiSampleQuality, 
                                   true, 
                                   &pSurface, 
                                   NULL);
        if(FAILED(hr))
        {
            break;
        }

        hr = m_AvailableSurfaces.Queue(pSurface);
        pSurface->Release();

        if(FAILED(hr))
        {
            break;
        }
    }

    hr = this->m_pDevice->CreateRenderTarget(pp.BackBufferWidth, 
                                          pp.BackBufferHeight, 
                                          pp.BackBufferFormat, 
                                          pp.MultiSampleType, 
                                          pp.MultiSampleQuality, 
                                          true, 
                                          &m_pReturnSurface, 
                                          NULL);

    return hr;
}
```

The queues will be stored in `ThreadSafeQueue` objects. This handy class is already provided in the sample and is used by the scheduler as well. The class maintains its own critical section so all `Queue()` and `Dequeue()` operations are synchronized. Moreover, when we store a pointer in the queue it increments its reference count and it decrements it when we remove an item from the queue. So we have to call Release() on an item when we store it in the queue and are done with it.

You should probably have noticed that we still maintain the `m_pReturnSurface`. This is still the only surface we return to D3DImage. If we returned surfaces from the pool it would explode D3DImage literally. Its memory consumption would grow to gigabytes in seconds and the application would crash. We escape this problem by making sure that the back buffer stays the same. However, it means we will have to do additional copying from `m_RenderedSurfaces` to `m_pReturnSurface`:

```
HRESULT PvpPresentEngineQueued::PresentSwapChain(
                             IDirect3DSwapChain9* pSwapChain, 
                             IDirect3DSurface9* pSurface)
{
    HRESULT hr = S_OK;

    IDirect3DSurface9 *pRenderSurface = NULL;
    if (m_AvailableSurfaces.Dequeue(&pRenderSurface) == S_OK)
    {
        hr = D3DXLoadSurfaceFromSurface(pRenderSurface,
                                        NULL,
                                        NULL,
                                        pSurface,
                                        NULL,
                                        NULL,
                                        D3DX_FILTER_NONE,
                                        0);

        m_RenderedSurfaces.Queue(pRenderSurface);
        pRenderSurface->Release();
    }

    return hr;
}

HRESULT PvpPresentEngineQueued::HasNewSurfaceArrived(
                                     BOOL *newSurfaceArrived)
{
    IDirect3DSurface9 *pSurface = NULL;
    if (m_RenderedSurfaces.Dequeue(&pSurface) == S_OK)
    {
        m_RenderedSurfaces.PutBack(pSurface);
        pSurface->Release();
        *newSurfaceArrived = TRUE;
    }
    else
    {
        *newSurfaceArrived = FALSE;
    }

    return S_OK;
}

HRESULT PvpPresentEngineQueued::GetBackBufferNoRef(
                                IDirect3DSurface9 **ppSurface)
{
    HRESULT hr = S_OK;
    *ppSurface = NULL;

    EnterCriticalSection(&m_ObjectLock); // to safely release 
                                         // and possibly 
                                         // re-create resources

    IDirect3DSurface9 *pSurface = NULL;
    if (m_RenderedSurfaces.Dequeue(&pSurface) == S_OK)
    {
        hr = D3DXLoadSurfaceFromSurface(m_pReturnSurface,
                                        NULL,
                                        NULL,
                                        pSurface,
                                        NULL,
                                        NULL,
                                        D3DX_FILTER_NONE,
                                        0);

        m_AvailableSurfaces.Queue(pSurface);
        pSurface->Release();

        if (SUCCEEDED(hr))
        {
            *ppSurface = m_pReturnSurface;
        }
    }

    LeaveCriticalSection(&m_ObjectLock);

    return hr;
}
```

As you can see `PresentSwapChain, HasNewSurfaceArrived` and `GetBackBufferNoRef` only lock each other on accessing either `m_AvailableSurfaces` or `m_RenderedSurfaces` queues. But this locking is significantly shorter as threads don’t have to wait for long operations like surface copying.

The lock on `m_ObjectLock` doesn’t have anything to do with the scheduler’s thread. It’s there to synchronize with the parent’s class when it decides to recreate D3D resources and thus makes us recreate ours.

This implementation noticeably improved performance of the presenter. However, when rendering full HD video or making D3DImage resize relatively small video frames to full HD resolutions you still can notice discrete “jumps” instead of smooth playback. However this time the “jumps” are less harsh as they were with dropped frames. Instead, you see another anomaly caused by the fact that the scheduler manages to add too many frames to `m_RenderedSurfaces` and we are not feeding them fast enough to D3DImage so the video starts lagging behind and you can see, for example, that a person’s lips are often unsynchronized with what the person says. It’s not a huge gap (I’m talking in terms of milliseconds here) but still noticeable.

We could add a check for frames’ presentation time before sending them to D3DImage but it would make us consciously start dropping frames again.

## Third (much better) solution

This solution was inspired by [WPF MediaKit project](http://wpfmediakit.codeplex.com/). The major difference is that instead of polling the renderer for new frames in `CompositionTarget.Rendering` event handler, we make the renderer callback into the managed code when a new frame is available. When I was running the MediaKit’s sample application I noticed that it produced better result than my previous solutions.

MediaKit’s version of the implementation renders a frame and sends a D3D surface to the managed code right in the callback before D3DImage is locked. This somewhat goes against official recommendation not to render on D3DImage’s back buffer when it’s unlocked.

I decided to make the callback a simple notification about a new surface availability. When we receive this notification we make our normal `GetBackBufferNoRef()` call to fetch the surface.

```
HRESULT PvpPresentEngine2::RegisterCallback(
             IPvpPresenterCallback *pCallback)
{
    m_pCallback = pCallback;
    return S_OK;
}

HRESULT PvpPresentEngine2::PresentSwapChain(
   IDirect3DSwapChain9* pSwapChain, IDirect3DSurface9* pSurface)
{
    HRESULT hr = S_OK;

    if (m_pCallback != NULL && m_pRecentSurface != pSurface) 
    {
        CopyComPointer(m_pRecentSurface, pSurface);

        hr = m_pCallback->OnNewSurfaceArrived();
    }

    return hr;
}

HRESULT PvpPresentEngine2::GetBackBufferNoRef(
                    IDirect3DSurface9 **ppSurface)
{
    EnterCriticalSection(&m_ObjectLock);

    HRESULT hr = S_OK;
    *ppSurface = NULL;

    if (m_pRecentSurface != NULL)
    {
        hr = D3DXLoadSurfaceFromSurface(m_pReturnSurface,
                                        NULL,
                                        NULL,
                                        m_pRecentSurface,
                                        NULL,
                                        NULL,
                                        D3DX_FILTER_NONE,
                                        0);

        if (SUCCEEDED(hr))
        {
            *ppSurface = m_pReturnSurface;
        }
    }

    LeaveCriticalSection(&m_ObjectLock);
    return hr;
}
```

As you can see I reverted to using just a single return surface to avoid synchronization issues. I also introduced new `IPvpPresenterCallback` interface and allows the presenter to send notifications to the managed code. My managed class implements this interface and here is the handler:

```
public int OnNewSurfaceArrived()
{
    _d3dImage.Dispatcher.Invoke(new Action(() =>
    {
        if (_d3dImage.IsFrontBufferAvailable)
        {
            _d3dImage.Lock();

            IntPtr pSurface;
            _pvpPresenter.GetBackBufferNoRef(out pSurface);

            if (pSurface != null)
            {
                // Repeatedly calling SetBackBuffer with 
                // the same IntPtr is a no-op. 
                // There is no performance penalty.
                _d3dImage.SetBackBuffer(
                   D3DResourceType.IDirect3DSurface9, pSurface);

                _d3dImage.AddDirtyRect(new Int32Rect(0, 0, 
                    _d3dImage.PixelWidth, _d3dImage.PixelHeight));
            }

            _d3dImage.Unlock();
        }
    }), System.Windows.Threading.DispatcherPriority.Send);

    return 0;
}
```

As the callback is invoked on the presenter’s scheduler thread we have to dispatch to a thread that D3DImage was created on in order to access it. I do it synchronously with the highest priority which effectively transforms into a direct call (well, a ‘send’ operation to be correct, but it’s supposed to be done immediately, not scheduled). The presenter thread is blocked until we return from the `Dispatcher.Invoke` handler.

I also tried asynchronous handling and it required additional locking on a critical section in the native code as we release the scheduler' thread and it go and try to substitute the recent surface anytime. However, this approach resulted in a less smooth experience compared to the synchronous handling.

One downside that you need to be aware of is that if D3DImage is created on your main UI thread, this thread becomes over occupied with rendering activities which negatively affects the responsiveness of your UI. Working with D3DImage is somewhat beyond the scope of the post but I recommend you have a look at [this post](http://blogs.msdn.com/b/dwayneneed/archive/2007/04/26/multithreaded-ui-hostvisual.aspx) explaining how you can build multithread UI in WPF.