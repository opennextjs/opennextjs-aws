/* gmain.h - the GLib Main loop
 * Copyright (C) 1998-2000 Red Hat, Inc.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this library; if not, see <http://www.gnu.org/licenses/>.
 */

#ifndef __G_MAIN_H__
#define __G_MAIN_H__

#if !defined (__GLIB_H_INSIDE__) && !defined (GLIB_COMPILATION)
#error "Only <glib.h> can be included directly."
#endif

#include <glib/gpoll.h>
#include <glib/gslist.h>
#include <glib/gthread.h>

G_BEGIN_DECLS

typedef enum /*< flags >*/
{
  G_IO_IN	GLIB_SYSDEF_POLLIN,
  G_IO_OUT	GLIB_SYSDEF_POLLOUT,
  G_IO_PRI	GLIB_SYSDEF_POLLPRI,
  G_IO_ERR	GLIB_SYSDEF_POLLERR,
  G_IO_HUP	GLIB_SYSDEF_POLLHUP,
  G_IO_NVAL	GLIB_SYSDEF_POLLNVAL
} GIOCondition;

/**
 * GMainContextFlags:
 * @G_MAIN_CONTEXT_FLAGS_NONE: Default behaviour.
 * @G_MAIN_CONTEXT_FLAGS_OWNERLESS_POLLING: Assume that polling for events will
 * free the thread to process other jobs. That's useful if you're using
 * `g_main_context_{prepare,query,check,dispatch}` to integrate GMainContext in
 * other event loops.
 *
 * Flags to pass to g_main_context_new_with_flags() which affect the behaviour
 * of a #GMainContext.
 *
 * Since: 2.72
 */
GLIB_AVAILABLE_TYPE_IN_2_72
typedef enum /*< flags >*/
{
  G_MAIN_CONTEXT_FLAGS_NONE = 0,
  G_MAIN_CONTEXT_FLAGS_OWNERLESS_POLLING = 1
} GMainContextFlags;


/**
 * GMainContext:
 *
 * The `GMainContext` struct is an opaque data
 * type representing a set of sources to be handled in a main loop.
 */
typedef struct _GMainContext            GMainContext;

/**
 * GMainLoop:
 *
 * The `GMainLoop` struct is an opaque data type
 * representing the main event loop of a GLib or GTK+ application.
 */
typedef struct _GMainLoop               GMainLoop;

/**
 * GSource:
 *
 * The `GSource` struct is an opaque data type
 * representing an event source.
 */
typedef struct _GSource                 GSource;
typedef struct _GSourcePrivate          GSourcePrivate;

/**
 * GSourceCallbackFuncs:
 * @ref: Called when a reference is added to the callback object
 * @unref: Called when a reference to the callback object is dropped
 * @get: Called to extract the callback function and data from the
 *     callback object.
 *
 * The `GSourceCallbackFuncs` struct contains
 * functions for managing callback objects.
 */
typedef struct _GSourceCallbackFuncs    GSourceCallbackFuncs;

/**
 * GSourceFuncs:
 * @prepare: Called before all the file descriptors are polled. If the
 *     source can determine that it is ready here (without waiting for the
 *     results of the poll() call) it should return %TRUE. It can also return
 *     a @timeout_ value which should be the maximum timeout (in milliseconds)
 *     which should be passed to the poll() call. The actual timeout used will
 *     be -1 if all sources returned -1, or it will be the minimum of all
 *     the @timeout_ values returned which were >= 0.  Since 2.36 this may
 *     be %NULL, in which case the effect is as if the function always returns
 *     %FALSE with a timeout of -1.  If @prepare returns a
 *     timeout and the source also has a ready time set, then the
 *     lower of the two will be used.
 * @check: Called after all the file descriptors are polled. The source
 *     should return %TRUE if it is ready to be dispatched. Note that some
 *     time may have passed since the previous prepare function was called,
 *     so the source should be checked again here.  Since 2.36 this may
 *     be %NULL, in which case the effect is as if the function always returns
 *     %FALSE.
 * @dispatch: Called to dispatch the event source, after it has returned
 *     %TRUE in either its @prepare or its @check function, or if a ready time
 *     has been reached. The @dispatch function receives a callback function and
 *     user data. The callback function may be %NULL if the source was never
 *     connected to a callback using g_source_set_callback(). The @dispatch
 *     function should call the callback function with @user_data and whatever
 *     additional parameters are needed for this type of event source. The
 *     return value of the @dispatch function should be %G_SOURCE_REMOVE if the
 *     source should be removed or %G_SOURCE_CONTINUE to keep it.
 * @finalize: Called when the source is finalized. At this point, the source
 *     will have been destroyed, had its callback cleared, and have been removed
 *     from its #GMainContext, but it will still have its final reference count,
 *     so methods can be called on it from within this function.
 *
 * The `GSourceFuncs` struct contains a table of
 * functions used to handle event sources in a generic manner.
 *
 * For idle sources, the prepare and check functions always return %TRUE
 * to indicate that the source is always ready to be processed. The prepare
 * function also returns a timeout value of 0 to ensure that the poll() call
 * doesn't block (since that would be time wasted which could have been spent
 * running the idle function).
 *
 * For timeout sources, the prepare and check functions both return %TRUE
 * if the timeout interval has expired. The prepare function also returns
 * a timeout value to ensure that the poll() call doesn't block too long
 * and miss the next timeout.
 *
 * For file descriptor sources, the prepare function typically returns %FALSE,
 * since it must wait until poll() has been called before it knows whether
 * any events need to be processed. It sets the returned timeout to -1 to
 * indicate that it doesn't mind how long the poll() call blocks. In the
 * check function, it tests the results of the poll() call to see if the
 * required condition has been met, and returns %TRUE if so.
 */
typedef struct _GSourceFuncs            GSourceFuncs;

/**
 * GPid:
 *
 * A type which is used to hold a process identification.
 *
 * On UNIX, processes are identified by a process id (an integer),
 * while Windows uses process handles (which are pointers).
 *
 * GPid is used in GLib only for descendant processes spawned with
 * the g_spawn functions.
 */
/* defined in glibconfig.h */

/**
 * G_PID_FORMAT:
 *
 * A format specifier that can be used in printf()-style format strings
 * when printing a #GPid.
 *
 * Since: 2.50
 */
/* defined in glibconfig.h */

/**
 * GSourceFunc:
 * @user_data: data passed to the function, set when the source was
 *     created with one of the above functions
 *
 * Specifies the type of function passed to g_timeout_add(),
 * g_timeout_add_full(), g_idle_add(), and g_idle_add_full().
 *
 * When calling g_source_set_callback(), you may need to cast a function of a
 * different type to this type. Use G_SOURCE_FUNC() to avoid warnings about
 * incompatible function types.
 *
 * Returns: %FALSE if the source should be removed. %G_SOURCE_CONTINUE and
 * %G_SOURCE_REMOVE are more memorable names for the return value.
 */
typedef gboolean (*GSourceFunc)       (gpointer user_data);

/**
 * GSourceOnceFunc:
 * @user_data: data passed to the function, set when the source was
 *   created
 *
 * A source function that is only called once before being removed from the main
 * context automatically.
 *
 * See: g_idle_add_once(), g_timeout_add_once()
 *
 * Since: 2.74
 */
typedef void (* GSourceOnceFunc) (gpointer user_data);

/**
 * G_SOURCE_FUNC:
 * @f: a function pointer.
 *
 * Cast a function pointer to a #GSourceFunc, suppressing warnings from GCC 8
 * onwards with `-Wextra` or `-Wcast-function-type` enabled about the function
 * types being incompatible.
 *
 * For example, the correct type of callback for a source created by
 * g_child_watch_source_new() is #GChildWatchFunc, which accepts more arguments
 * than #GSourceFunc. Casting the function with `(GSourceFunc)` to call
 * g_source_set_callback() will trigger a warning, even though it will be cast
 * back to the correct type before it is called by the source.
 *
 * Since: 2.58
 */
#define G_SOURCE_FUNC(f) ((GSourceFunc) (void (*)(void)) (f)) GLIB_AVAILABLE_MACRO_IN_2_58

/**
 * GChildWatchFunc:
 * @pid: the process id of the child process
 * @wait_status: Status information about the child process, encoded
 *               in a platform-specific manner
 * @user_data: user data passed to g_child_watch_add()
 *
 * Prototype of a #GChildWatchSource callback, called when a child
 * process has exited.
 *
 * To interpret @wait_status, see the documentation
 * for g_spawn_check_wait_status(). In particular,
 * on Unix platforms, note that it is usually not equal
 * to the integer passed to `exit()` or returned from `main()`.
 */
typedef void     (*GChildWatchFunc)   (GPid     pid,
                                       gint     wait_status,
                                       gpointer user_data);


/**
 * GSourceDisposeFunc:
 * @source: #GSource that is currently being disposed
 *
 * Dispose function for @source. See g_source_set_dispose_function() for
 * details.
 *
 * Since: 2.64
 */
GLIB_AVAILABLE_TYPE_IN_2_64
typedef void (*GSourceDisposeFunc)       (GSource *source);

struct _GSource
{
  /*< private >*/
  gpointer callback_data;
  GSourceCallbackFuncs *callback_funcs;

  const GSourceFuncs *source_funcs;
  guint ref_count;

  GMainContext *context;

  gint priority;
  guint flags;
  guint source_id;

  GSList *poll_fds;
  
  GSource *prev;
  GSource *next;

  char    *name;

  GSourcePrivate *priv;
};

struct _GSourceCallbackFuncs
{
  void (*ref)   (gpointer     cb_data);
  void (*unref) (gpointer     cb_data);
  void (*get)   (gpointer     cb_data,
                 GSource     *source, 
                 GSourceFunc *func,
                 gpointer    *data);
};

/**
 * GSourceDummyMarshal:
 *
 * This is just a placeholder for #GClosureMarshal,
 * which cannot be used here for dependency reasons.
 */
typedef void (*GSourceDummyMarshal) (void);

struct _GSourceFuncs
{
  gboolean (*prepare)  (GSource    *source,
                        gint       *timeout_);/* Can be NULL */
  gboolean (*check)    (GSource    *source);/* Can be NULL */
  gboolean (*dispatch) (GSource    *source,
                        GSourceFunc callback,
                        gpointer    user_data);
  void     (*finalize) (GSource    *source); /* Can be NULL */

  /*< private >*/
  /* For use by g_source_set_closure */
  GSourceFunc     closure_callback;        
  GSourceDummyMarshal closure_marshal; /* Really is of type GClosureMarshal */
};

/* Standard priorities */

/**
 * G_PRIORITY_HIGH:
 *
 * Use this for high priority event sources.
 *
 * It is not used within GLib or GTK+.
 */
#define G_PRIORITY_HIGH            -100

/**
 * G_PRIORITY_DEFAULT:
 *
 * Use this for default priority event sources.
 *
 * In GLib this priority is used when adding timeout functions
 * with g_timeout_add(). In GDK this priority is used for events
 * from the X server.
 */
#define G_PRIORITY_DEFAULT          0

/**
 * G_PRIORITY_HIGH_IDLE:
 *
 * Use this for high priority idle functions.
 *
 * GTK+ uses %G_PRIORITY_HIGH_IDLE + 10 for resizing operations,
 * and %G_PRIORITY_HIGH_IDLE + 20 for redrawing operations. (This is
 * done to ensure that any pending resizes are processed before any
 * pending redraws, so that widgets are not redrawn twice unnecessarily.)
 */
#define G_PRIORITY_HIGH_IDLE        100

/**
 * G_PRIORITY_DEFAULT_IDLE:
 *
 * Use this for default priority idle functions.
 *
 * In GLib this priority is used when adding idle functions with
 * g_idle_add().
 */
#define G_PRIORITY_DEFAULT_IDLE     200

/**
 * G_PRIORITY_LOW:
 *
 * Use this for very low priority background tasks.
 *
 * It is not used within GLib or GTK+.
 */
#define G_PRIORITY_LOW              300

/**
 * G_SOURCE_REMOVE:
 *
 * Use this macro as the return value of a #GSourceFunc to remove
 * the #GSource from the main loop.
 *
 * Since: 2.32
 */
#define G_SOURCE_REMOVE         FALSE

/**
 * G_SOURCE_CONTINUE:
 *
 * Use this macro as the return value of a #GSourceFunc to leave
 * the #GSource in the main loop.
 *
 * Since: 2.32
 */
#define G_SOURCE_CONTINUE       TRUE

/* GMainContext: */

GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_context_new       (void);
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_AVAILABLE_IN_2_72
GMainContext *g_main_context_new_with_flags (GMainContextFlags flags);
G_GNUC_END_IGNORE_DEPRECATIONS
GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_context_ref       (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
void          g_main_context_unref     (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_context_default   (void);

GLIB_AVAILABLE_IN_ALL
gboolean      g_main_context_iteration (GMainContext *context,
                                        gboolean      may_block);
GLIB_AVAILABLE_IN_ALL
gboolean      g_main_context_pending   (GMainContext *context);

/* For implementation of legacy interfaces
 */
GLIB_AVAILABLE_IN_ALL
GSource      *g_main_context_find_source_by_id              (GMainContext *context,
                                                             guint         source_id);
GLIB_AVAILABLE_IN_ALL
GSource      *g_main_context_find_source_by_user_data       (GMainContext *context,
                                                             gpointer      user_data);
GLIB_AVAILABLE_IN_ALL
GSource      *g_main_context_find_source_by_funcs_user_data (GMainContext *context,
                                                             GSourceFuncs *funcs,
                                                             gpointer      user_data);

/* Low level functions for implementing custom main loops.
 */
GLIB_AVAILABLE_IN_ALL
void     g_main_context_wakeup  (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
gboolean g_main_context_acquire (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
void     g_main_context_release (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
gboolean g_main_context_is_owner (GMainContext *context);
GLIB_DEPRECATED_IN_2_58_FOR(g_main_context_is_owner)
gboolean g_main_context_wait    (GMainContext *context,
                                 GCond        *cond,
                                 GMutex       *mutex);

GLIB_AVAILABLE_IN_ALL
gboolean g_main_context_prepare  (GMainContext *context,
                                  gint         *priority);
GLIB_AVAILABLE_IN_ALL
gint     g_main_context_query    (GMainContext *context,
                                  gint          max_priority,
                                  gint         *timeout_,
                                  GPollFD      *fds,
                                  gint          n_fds);
GLIB_AVAILABLE_IN_ALL
gboolean     g_main_context_check    (GMainContext *context,
                                      gint          max_priority,
                                      GPollFD      *fds,
                                      gint          n_fds);
GLIB_AVAILABLE_IN_ALL
void     g_main_context_dispatch (GMainContext *context);

GLIB_AVAILABLE_IN_ALL
void     g_main_context_set_poll_func (GMainContext *context,
                                       GPollFunc     func);
GLIB_AVAILABLE_IN_ALL
GPollFunc g_main_context_get_poll_func (GMainContext *context);

/* Low level functions for use by source implementations
 */
GLIB_AVAILABLE_IN_ALL
void     g_main_context_add_poll    (GMainContext *context,
                                     GPollFD      *fd,
                                     gint          priority);
GLIB_AVAILABLE_IN_ALL
void     g_main_context_remove_poll (GMainContext *context,
                                     GPollFD      *fd);

GLIB_AVAILABLE_IN_ALL
gint     g_main_depth               (void);
GLIB_AVAILABLE_IN_ALL
GSource *g_main_current_source      (void);

/* GMainContexts for other threads
 */
GLIB_AVAILABLE_IN_ALL
void          g_main_context_push_thread_default (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
void          g_main_context_pop_thread_default  (GMainContext *context);
GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_context_get_thread_default  (void);
GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_context_ref_thread_default  (void);

/**
 * GMainContextPusher:
 *
 * Opaque type. See g_main_context_pusher_new() for details.
 *
 * Since: 2.64
 */
typedef void GMainContextPusher GLIB_AVAILABLE_TYPE_IN_2_64;

/**
 * g_main_context_pusher_new:
 * @main_context: (transfer none): a main context to push
 *
 * Push @main_context as the new thread-default main context for the current
 * thread, using g_main_context_push_thread_default(), and return a new
 * #GMainContextPusher. Pop with g_main_context_pusher_free(). Using
 * g_main_context_pop_thread_default() on @main_context while a
 * #GMainContextPusher exists for it can lead to undefined behaviour.
 *
 * Using two #GMainContextPushers in the same scope is not allowed, as it leads
 * to an undefined pop order.
 *
 * This is intended to be used with g_autoptr().  Note that g_autoptr()
 * is only available when using GCC or clang, so the following example
 * will only work with those compilers:
 * |[
 * typedef struct
 * {
 *   ...
 *   GMainContext *context;
 *   ...
 * } MyObject;
 *
 * static void
 * my_object_do_stuff (MyObject *self)
 * {
 *   g_autoptr(GMainContextPusher) pusher = g_main_context_pusher_new (self->context);
 *
 *   // Code with main context as the thread default here
 *
 *   if (cond)
 *     // No need to pop
 *     return;
 *
 *   // Optionally early pop
 *   g_clear_pointer (&pusher, g_main_context_pusher_free);
 *
 *   // Code with main context no longer the thread default here
 * }
 * ]|
 *
 * Returns: (transfer full): a #GMainContextPusher
 * Since: 2.64
 */
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_AVAILABLE_STATIC_INLINE_IN_2_64
static inline GMainContextPusher *
g_main_context_pusher_new (GMainContext *main_context)
{
  g_main_context_push_thread_default (main_context);
  return (GMainContextPusher *) main_context;
}
G_GNUC_END_IGNORE_DEPRECATIONS

/**
 * g_main_context_pusher_free:
 * @pusher: (transfer full): a #GMainContextPusher
 *
 * Pop @pusher’s main context as the thread default main context.
 * See g_main_context_pusher_new() for details.
 *
 * This will pop the #GMainContext as the current thread-default main context,
 * but will not call g_main_context_unref() on it.
 *
 * Since: 2.64
 */
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_AVAILABLE_STATIC_INLINE_IN_2_64
static inline void
g_main_context_pusher_free (GMainContextPusher *pusher)
{
  g_main_context_pop_thread_default ((GMainContext *) pusher);
}
G_GNUC_END_IGNORE_DEPRECATIONS

/* GMainLoop: */

GLIB_AVAILABLE_IN_ALL
GMainLoop *g_main_loop_new        (GMainContext *context,
                                   gboolean      is_running);
GLIB_AVAILABLE_IN_ALL
void       g_main_loop_run        (GMainLoop    *loop);
GLIB_AVAILABLE_IN_ALL
void       g_main_loop_quit       (GMainLoop    *loop);
GLIB_AVAILABLE_IN_ALL
GMainLoop *g_main_loop_ref        (GMainLoop    *loop);
GLIB_AVAILABLE_IN_ALL
void       g_main_loop_unref      (GMainLoop    *loop);
GLIB_AVAILABLE_IN_ALL
gboolean   g_main_loop_is_running (GMainLoop    *loop);
GLIB_AVAILABLE_IN_ALL
GMainContext *g_main_loop_get_context (GMainLoop    *loop);

/* GSource: */

GLIB_AVAILABLE_IN_ALL
GSource *g_source_new             (GSourceFuncs   *source_funcs,
                                   guint           struct_size);

G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_AVAILABLE_IN_2_64
void     g_source_set_dispose_function (GSource            *source,
                                        GSourceDisposeFunc  dispose);
G_GNUC_END_IGNORE_DEPRECATIONS

GLIB_AVAILABLE_IN_ALL
GSource *g_source_ref             (GSource        *source);
GLIB_AVAILABLE_IN_ALL
void     g_source_unref           (GSource        *source);

GLIB_AVAILABLE_IN_ALL
guint    g_source_attach          (GSource        *source,
                                   GMainContext   *context);
GLIB_AVAILABLE_IN_ALL
void     g_source_destroy         (GSource        *source);

GLIB_AVAILABLE_IN_ALL
void     g_source_set_priority    (GSource        *source,
                                   gint            priority);
GLIB_AVAILABLE_IN_ALL
gint     g_source_get_priority    (GSource        *source);
GLIB_AVAILABLE_IN_ALL
void     g_source_set_can_recurse (GSource        *source,
                                   gboolean        can_recurse);
GLIB_AVAILABLE_IN_ALL
gboolean g_source_get_can_recurse (GSource        *source);
GLIB_AVAILABLE_IN_ALL
guint    g_source_get_id          (GSource        *source);

GLIB_AVAILABLE_IN_ALL
GMainContext *g_source_get_context (GSource       *source);

GLIB_AVAILABLE_IN_ALL
void     g_source_set_callback    (GSource        *source,
                                   GSourceFunc     func,
                                   gpointer        data,
                                   GDestroyNotify  notify);

GLIB_AVAILABLE_IN_ALL
void     g_source_set_funcs       (GSource        *source,
                                   GSourceFuncs   *funcs);
GLIB_AVAILABLE_IN_ALL
gboolean g_source_is_destroyed    (GSource        *source);

GLIB_AVAILABLE_IN_ALL
void                 g_source_set_name       (GSource        *source,
                                              const char     *name);
GLIB_AVAILABLE_IN_2_70
void                 g_source_set_static_name (GSource        *source,
                                               const char     *name);
GLIB_AVAILABLE_IN_ALL
const char *         g_source_get_name       (GSource        *source);
GLIB_AVAILABLE_IN_ALL
void                 g_source_set_name_by_id (guint           tag,
                                              const char     *name);

GLIB_AVAILABLE_IN_2_36
void                 g_source_set_ready_time (GSource        *source,
                                              gint64          ready_time);
GLIB_AVAILABLE_IN_2_36
gint64               g_source_get_ready_time (GSource        *source);

#ifdef G_OS_UNIX
GLIB_AVAILABLE_IN_2_36
gpointer             g_source_add_unix_fd    (GSource        *source,
                                              gint            fd,
                                              GIOCondition    events);
GLIB_AVAILABLE_IN_2_36
void                 g_source_modify_unix_fd (GSource        *source,
                                              gpointer        tag,
                                              GIOCondition    new_events);
GLIB_AVAILABLE_IN_2_36
void                 g_source_remove_unix_fd (GSource        *source,
                                              gpointer        tag);
GLIB_AVAILABLE_IN_2_36
GIOCondition         g_source_query_unix_fd  (GSource        *source,
                                              gpointer        tag);
#endif

/* Used to implement g_source_connect_closure and internally*/
GLIB_AVAILABLE_IN_ALL
void g_source_set_callback_indirect (GSource              *source,
                                     gpointer              callback_data,
                                     GSourceCallbackFuncs *callback_funcs);

GLIB_AVAILABLE_IN_ALL
void     g_source_add_poll            (GSource        *source,
				       GPollFD        *fd);
GLIB_AVAILABLE_IN_ALL
void     g_source_remove_poll         (GSource        *source,
				       GPollFD        *fd);

GLIB_AVAILABLE_IN_ALL
void     g_source_add_child_source    (GSource        *source,
				       GSource        *child_source);
GLIB_AVAILABLE_IN_ALL
void     g_source_remove_child_source (GSource        *source,
				       GSource        *child_source);

G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_DEPRECATED_IN_2_28_FOR(g_source_get_time)
void     g_source_get_current_time (GSource        *source,
                                    GTimeVal       *timeval);
G_GNUC_END_IGNORE_DEPRECATIONS

GLIB_AVAILABLE_IN_ALL
gint64   g_source_get_time         (GSource        *source);

 /* void g_source_connect_closure (GSource        *source,
                                  GClosure       *closure);
 */

/* Specific source types
 */
GLIB_AVAILABLE_IN_ALL
GSource *g_idle_source_new        (void);
GLIB_AVAILABLE_IN_ALL
GSource *g_child_watch_source_new (GPid pid);
GLIB_AVAILABLE_IN_ALL
GSource *g_timeout_source_new     (guint interval);
GLIB_AVAILABLE_IN_ALL
GSource *g_timeout_source_new_seconds (guint interval);

/* Miscellaneous functions
 */
G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_DEPRECATED_IN_2_62_FOR(g_get_real_time)
void   g_get_current_time                 (GTimeVal       *result);
G_GNUC_END_IGNORE_DEPRECATIONS

GLIB_AVAILABLE_IN_ALL
gint64 g_get_monotonic_time               (void);
GLIB_AVAILABLE_IN_ALL
gint64 g_get_real_time                    (void);


/* Source manipulation by ID */
GLIB_AVAILABLE_IN_ALL
gboolean g_source_remove                     (guint          tag);
GLIB_AVAILABLE_IN_ALL
gboolean g_source_remove_by_user_data        (gpointer       user_data);
GLIB_AVAILABLE_IN_ALL
gboolean g_source_remove_by_funcs_user_data  (GSourceFuncs  *funcs,
                                              gpointer       user_data);

/**
 * GClearHandleFunc:
 * @handle_id: the handle ID to clear
 *
 * Specifies the type of function passed to g_clear_handle_id().
 * The implementation is expected to free the resource identified
 * by @handle_id; for instance, if @handle_id is a #GSource ID,
 * g_source_remove() can be used.
 *
 * Since: 2.56
 */
typedef void (* GClearHandleFunc) (guint handle_id);

GLIB_AVAILABLE_IN_2_56
void    g_clear_handle_id (guint           *tag_ptr,
                           GClearHandleFunc clear_func);

#define g_clear_handle_id(tag_ptr, clear_func)             \
  G_STMT_START {                                           \
    G_STATIC_ASSERT (sizeof *(tag_ptr) == sizeof (guint)); \
    guint *_tag_ptr = (guint *) (tag_ptr);                 \
    guint _handle_id;                                      \
                                                           \
    _handle_id = *_tag_ptr;                                \
    if (_handle_id > 0)                                    \
      {                                                    \
        *_tag_ptr = 0;                                     \
        clear_func (_handle_id);                           \
      }                                                    \
  } G_STMT_END                                             \
  GLIB_AVAILABLE_MACRO_IN_2_56

/* Idles, child watchers and timeouts */
GLIB_AVAILABLE_IN_ALL
guint    g_timeout_add_full         (gint            priority,
                                     guint           interval,
                                     GSourceFunc     function,
                                     gpointer        data,
                                     GDestroyNotify  notify);
GLIB_AVAILABLE_IN_ALL
guint    g_timeout_add              (guint           interval,
                                     GSourceFunc     function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_2_74
guint    g_timeout_add_once         (guint           interval,
                                     GSourceOnceFunc function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_ALL
guint    g_timeout_add_seconds_full (gint            priority,
                                     guint           interval,
                                     GSourceFunc     function,
                                     gpointer        data,
                                     GDestroyNotify  notify);
GLIB_AVAILABLE_IN_ALL
guint    g_timeout_add_seconds      (guint           interval,
                                     GSourceFunc     function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_ALL
guint    g_child_watch_add_full     (gint            priority,
                                     GPid            pid,
                                     GChildWatchFunc function,
                                     gpointer        data,
                                     GDestroyNotify  notify);
GLIB_AVAILABLE_IN_ALL
guint    g_child_watch_add          (GPid            pid,
                                     GChildWatchFunc function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_ALL
guint    g_idle_add                 (GSourceFunc     function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_ALL
guint    g_idle_add_full            (gint            priority,
                                     GSourceFunc     function,
                                     gpointer        data,
                                     GDestroyNotify  notify);
GLIB_AVAILABLE_IN_2_74
guint    g_idle_add_once            (GSourceOnceFunc function,
                                     gpointer        data);
GLIB_AVAILABLE_IN_ALL
gboolean g_idle_remove_by_data      (gpointer        data);

GLIB_AVAILABLE_IN_ALL
void     g_main_context_invoke_full (GMainContext   *context,
                                     gint            priority,
                                     GSourceFunc     function,
                                     gpointer        data,
                                     GDestroyNotify  notify);
GLIB_AVAILABLE_IN_ALL
void     g_main_context_invoke      (GMainContext   *context,
                                     GSourceFunc     function,
                                     gpointer        data);

GLIB_AVAILABLE_STATIC_INLINE_IN_2_70
static inline int
g_steal_fd (int *fd_ptr)
{
  int fd = *fd_ptr;
  *fd_ptr = -1;
  return fd;
}

/* Hook for GClosure / GSource integration. Don't touch */
GLIB_VAR GSourceFuncs g_timeout_funcs;
GLIB_VAR GSourceFuncs g_child_watch_funcs;
GLIB_VAR GSourceFuncs g_idle_funcs;
#ifdef G_OS_UNIX
GLIB_VAR GSourceFuncs g_unix_signal_funcs;
GLIB_VAR GSourceFuncs g_unix_fd_source_funcs;
#endif

G_END_DECLS

#endif /* __G_MAIN_H__ */
