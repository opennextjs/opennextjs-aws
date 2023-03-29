/* GdkPixbuf library - Io handling.  This is an internal header for 
 * GdkPixbuf. You should never use it unless you are doing development for 
 * GdkPixbuf itself.
 *
 * Copyright (C) 1999 The Free Software Foundation
 *
 * Authors: Mark Crichton <crichton@gimp.org>
 *          Miguel de Icaza <miguel@gnu.org>
 *          Federico Mena-Quintero <federico@gimp.org>
 *          Jonathan Blandford <jrb@redhat.com>
 *          Michael Fulbright <drmike@redhat.com>
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, see <http://www.gnu.org/licenses/>.
 */

#ifndef GDK_PIXBUF_IO_H
#define GDK_PIXBUF_IO_H

#if defined(GDK_PIXBUF_DISABLE_SINGLE_INCLUDES) && !defined (GDK_PIXBUF_H_INSIDE) && !defined (GDK_PIXBUF_COMPILATION)
#error "Only <gdk-pixbuf/gdk-pixbuf.h> can be included directly."
#endif

#include <stdio.h>
#include <glib.h>
#include <gmodule.h>
#include <gdk-pixbuf/gdk-pixbuf-core.h>
#include <gdk-pixbuf/gdk-pixbuf-animation.h>

G_BEGIN_DECLS

typedef struct _GdkPixbufFormat GdkPixbufFormat;

GDK_PIXBUF_AVAILABLE_IN_2_40
gboolean gdk_pixbuf_init_modules (const char  *path,
                                  GError     **error);

GDK_PIXBUF_AVAILABLE_IN_ALL
GType gdk_pixbuf_format_get_type (void) G_GNUC_CONST;

GDK_PIXBUF_AVAILABLE_IN_ALL
GSList    *gdk_pixbuf_get_formats            (void);
GDK_PIXBUF_AVAILABLE_IN_2_2
gchar     *gdk_pixbuf_format_get_name        (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_2
gchar     *gdk_pixbuf_format_get_description (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_2
gchar    **gdk_pixbuf_format_get_mime_types  (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_2
gchar    **gdk_pixbuf_format_get_extensions  (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_36
gboolean   gdk_pixbuf_format_is_save_option_supported (GdkPixbufFormat *format,
                                                       const gchar     *option_key);
GDK_PIXBUF_AVAILABLE_IN_2_2
gboolean   gdk_pixbuf_format_is_writable     (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_6
gboolean   gdk_pixbuf_format_is_scalable     (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_6
gboolean   gdk_pixbuf_format_is_disabled     (GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_2_6
void       gdk_pixbuf_format_set_disabled    (GdkPixbufFormat *format,
					      gboolean         disabled);
GDK_PIXBUF_AVAILABLE_IN_2_6
gchar     *gdk_pixbuf_format_get_license     (GdkPixbufFormat *format);

GDK_PIXBUF_AVAILABLE_IN_2_4
GdkPixbufFormat *gdk_pixbuf_get_file_info    (const gchar     *filename,
					      gint            *width, 
					      gint            *height);
GDK_PIXBUF_AVAILABLE_IN_2_32
void             gdk_pixbuf_get_file_info_async  (const gchar          *filename,
						  GCancellable         *cancellable,
						  GAsyncReadyCallback   callback,
						  gpointer              user_data);
GDK_PIXBUF_AVAILABLE_IN_2_32
GdkPixbufFormat *gdk_pixbuf_get_file_info_finish (GAsyncResult         *async_result,
						  gint                 *width,
						  gint                 *height,
						  GError              **error);

GDK_PIXBUF_AVAILABLE_IN_ALL
GdkPixbufFormat *gdk_pixbuf_format_copy (const GdkPixbufFormat *format);
GDK_PIXBUF_AVAILABLE_IN_ALL
void             gdk_pixbuf_format_free (GdkPixbufFormat       *format);

#ifdef GDK_PIXBUF_ENABLE_BACKEND



/**
 * GdkPixbufModuleSizeFunc:
 * @width: pointer to a location containing the current image width
 * @height: pointer to a location containing the current image height
 * @user_data: the loader.
 * 
 * Defines the type of the function that gets called once the size 
 * of the loaded image is known.
 * 
 * The function is expected to set @width and @height to the desired
 * size to which the image should be scaled. If a module has no efficient 
 * way to achieve the desired scaling during the loading of the image, it may
 * either ignore the size request, or only approximate it - gdk-pixbuf will
 * then perform the required scaling on the completely loaded image. 
 * 
 * If the function sets @width or @height to zero, the module should interpret
 * this as a hint that it will be closed soon and shouldn't allocate further 
 * resources. This convention is used to implement gdk_pixbuf_get_file_info()
 * efficiently.
 * 
 * Since: 2.2
 */
typedef void (* GdkPixbufModuleSizeFunc)           (gint *width, 
						    gint *height, 
						    gpointer user_data);

/**
 * GdkPixbufModulePreparedFunc:
 * @pixbuf: the #GdkPixbuf that is currently being loaded.
 * @anim: if an animation is being loaded, the #GdkPixbufAnimation, else %NULL.
 * @user_data: the loader.
 * 
 * Defines the type of the function that gets called once the initial 
 * setup of @pixbuf is done.
 * 
 * #GdkPixbufLoader uses a function of this type to emit the 
 * "<link linkend="GdkPixbufLoader-area-prepared">area_prepared</link>"
 * signal.
 * 
 * Since: 2.2
 */
typedef void (* GdkPixbufModulePreparedFunc) (GdkPixbuf          *pixbuf,
					      GdkPixbufAnimation *anim,
					      gpointer            user_data);

/**
 * GdkPixbufModuleUpdatedFunc:
 * @pixbuf: the #GdkPixbuf that is currently being loaded.
 * @x: the X origin of the updated area.
 * @y: the Y origin of the updated area.
 * @width: the width of the updated area.
 * @height: the height of the updated area.
 * @user_data: the loader.
 * 
 * Defines the type of the function that gets called every time a region
 * of @pixbuf is updated.
 * 
 * #GdkPixbufLoader uses a function of this type to emit the 
 * "<link linkend="GdkPixbufLoader-area-updated">area_updated</link>"
 * signal.
 * 
 * Since: 2.2
 */
typedef void (* GdkPixbufModuleUpdatedFunc)  (GdkPixbuf *pixbuf,
					      int        x,
					      int        y,
					      int        width,
					      int        height,
					      gpointer   user_data);

/**
 * GdkPixbufModulePattern:
 * @prefix: the prefix for this pattern
 * @mask: mask containing bytes which modify how the prefix is matched against
 *  test data
 * @relevance: relevance of this pattern
 *
 * The signature prefix for a module.
 * 
 * The signature of a module is a set of prefixes. Prefixes are encoded as
 * pairs of ordinary strings, where the second string, called the mask, if 
 * not `NULL`, must be of the same length as the first one and may contain
 * ' ', '!', 'x', 'z', and 'n' to indicate bytes that must be matched, 
 * not matched, "don't-care"-bytes, zeros and non-zeros, respectively.
 *
 * Each prefix has an associated integer that describes the relevance of 
 * the prefix, with 0 meaning a mismatch and 100 a "perfect match".
 * 
 * Starting with gdk-pixbuf 2.8, the first byte of the mask may be '*', 
 * indicating an unanchored pattern that matches not only at the beginning, 
 * but also in the middle. Versions prior to 2.8 will interpret the '*'
 * like an 'x'.
 * 
 * The signature of a module is stored as an array of 
 * `GdkPixbufModulePatterns`. The array is terminated by a pattern
 * where the `prefix` is `NULL`.
 * 
 * ```c
 * GdkPixbufModulePattern *signature[] = {
 *   { "abcdx", " !x z", 100 },
 *   { "bla", NULL,  90 },
 *   { NULL, NULL, 0 }
 * };
 * ```
 *
 * In the example above, the signature matches e.g. "auud\0" with
 * relevance 100, and "blau" with relevance 90.
 * 
 * Since: 2.2
 */
typedef struct _GdkPixbufModulePattern GdkPixbufModulePattern;
struct _GdkPixbufModulePattern {
	char *prefix;
	char *mask;
	int relevance;
};

/**
 * GdkPixbufModuleLoadFunc:
 * @f: the file stream from which the image should be loaded
 * @error: return location for a loading error
 *
 * Loads a file from a standard C file stream into a new `GdkPixbuf`.
 *
 * In case of error, this function should return `NULL` and set the `error` argument.
 *
 * Returns: (transfer full): a newly created `GdkPixbuf` for the contents of the file
 */
typedef GdkPixbuf *(* GdkPixbufModuleLoadFunc) (FILE *f,
                                                GError **error);

/**
 * GdkPixbufModuleLoadXpmDataFunc:
 * @data: (array zero-terminated=1): the XPM data
 *
 * Loads XPM data into a new `GdkPixbuf`.
 *
 * Returns: (transfer full): a newly created `GdkPixbuf` for the XPM data
 */
typedef GdkPixbuf *(* GdkPixbufModuleLoadXpmDataFunc) (const char **data);

/**
 * GdkPixbufModuleLoadAnimationFunc:
 * @f: the file stream from which the image should be loaded
 * @error: return location for a loading error
 *
 * Loads a file from a standard C file stream into a new `GdkPixbufAnimation`.
 *
 * In case of error, this function should return `NULL` and set the `error` argument.
 *
 * Returns: (transfer full): a newly created `GdkPixbufAnimation` for the contents of the file
 */
typedef GdkPixbufAnimation *(* GdkPixbufModuleLoadAnimationFunc) (FILE *f,
                                                                  GError **error);

/**
 * GdkPixbufModuleBeginLoadFunc:
 * @size_func: the function to be called when the size is known
 * @prepared_func: the function to be called when the data has been prepared
 * @updated_func: the function to be called when the data has been updated
 * @user_data: the data to be passed to the functions
 * @error: return location for a loading error
 *
 * Sets up the image loading state.
 *
 * The image loader is responsible for storing the given function pointers
 * and user data, and call them when needed.
 *
 * The image loader should set up an internal state object, and return it
 * from this function; the state object will then be updated from the
 * [callback@GdkPixbuf.PixbufModuleIncrementLoadFunc] callback, and will be freed
 * by [callback@GdkPixbuf.PixbufModuleStopLoadFunc] callback.
 *
 * Returns: (transfer full): the data to be passed to
 *   [callback@GdkPixbuf.PixbufModuleIncrementLoadFunc]
 *   and [callback@GdkPixbuf.PixbufModuleStopLoadFunc], or `NULL` in case of error
 */
typedef gpointer (* GdkPixbufModuleBeginLoadFunc) (GdkPixbufModuleSizeFunc size_func,
                                                   GdkPixbufModulePreparedFunc prepared_func,
                                                   GdkPixbufModuleUpdatedFunc updated_func,
                                                   gpointer user_data,
                                                   GError **error);

/**
 * GdkPixbufModuleStopLoadFunc:
 * @context: (transfer full): the state object created by [callback@GdkPixbuf.PixbufModuleBeginLoadFunc]
 * @error: return location for a loading error
 *
 * Finalizes the image loading state.
 *
 * This function is called on success and error states.
 *
 * Returns: `TRUE` if the loading operation was successful
 */
typedef gboolean (* GdkPixbufModuleStopLoadFunc) (gpointer context,
                                                  GError **error);

/**
 * GdkPixbufModuleIncrementLoadFunc:
 * @context: (transfer none): the state object created by [callback@GdkPixbuf.PixbufModuleBeginLoadFunc]
 * @buf: (array length=size) (element-type guint8): the data to load
 * @size: the length of the data to load
 * @error: return location for a loading error
 *
 * Incrementally loads a buffer into the image data.
 *
 * Returns: `TRUE` if the incremental load was successful
 */
typedef gboolean (* GdkPixbufModuleIncrementLoadFunc) (gpointer context,
                                                       const guchar *buf,
                                                       guint size,
                                                       GError **error);

/**
 * GdkPixbufModuleSaveFunc:
 * @f: the file stream into which the image should be saved
 * @pixbuf: the image to save
 * @param_keys: (nullable) (array zero-terminated=1): parameter keys to save
 * @param_values: (nullable) (array zero-terminated=1): parameter values to save
 * @error: return location for a saving error
 *
 * Saves a `GdkPixbuf` into a standard C file stream.
 *
 * The optional `param_keys` and `param_values` arrays contain the keys and
 * values (in the same order) for attributes to be saved alongside the image
 * data.
 *
 * Returns: `TRUE` on success; in case of failure, `FALSE` is returned and
 *   the `error` is set
 */
typedef gboolean (* GdkPixbufModuleSaveFunc) (FILE *f,
                                              GdkPixbuf *pixbuf,
                                              gchar **param_keys,
                                              gchar **param_values,
                                              GError **error);

/**
 * GdkPixbufModuleSaveCallbackFunc:
 * @save_func: the function to call when saving
 * @user_data: (closure): the data to pass to @save_func
 * @pixbuf: the `GdkPixbuf` to save
 * @option_keys: (nullable) (array zero-terminated=1): an array of option names
 * @option_values: (nullable) (array zero-terminated=1): an array of option values
 * @error: return location for a save error
 *
 * Saves a `GdkPixbuf` by calling the provided function.
 *
 * The optional `option_keys` and `option_values` arrays contain the keys and
 * values (in the same order) for attributes to be saved alongside the image
 * data.
 *
 * Returns: `TRUE` on success; in case of failure, `FALSE` is returned and
 *   the `error` is set
 */
typedef gboolean (* GdkPixbufModuleSaveCallbackFunc) (GdkPixbufSaveFunc save_func,
                                                      gpointer user_data,
                                                      GdkPixbuf *pixbuf,
                                                      gchar **option_keys,
                                                      gchar **option_values,
                                                      GError **error);

/**
 * GdkPixbufModuleSaveOptionSupportedFunc:
 * @option_key: the option key to check
 *
 * Checks whether the given `option_key` is supported when saving.
 *
 * Returns: `TRUE` if the option is supported
 */
typedef gboolean (* GdkPixbufModuleSaveOptionSupportedFunc) (const gchar *option_key);

typedef struct _GdkPixbufModule GdkPixbufModule;
struct _GdkPixbufModule {
	char *module_name;
	char *module_path;
	GModule *module;
	GdkPixbufFormat *info;

        /* Atomic loading */
        GdkPixbufModuleLoadFunc load;
        GdkPixbufModuleLoadXpmDataFunc load_xpm_data;

        /* Incremental loading */
        GdkPixbufModuleBeginLoadFunc begin_load;
        GdkPixbufModuleStopLoadFunc stop_load;
        GdkPixbufModuleIncrementLoadFunc load_increment;

	/* Animation loading */
        GdkPixbufModuleLoadAnimationFunc load_animation;

        /* Saving */
        GdkPixbufModuleSaveFunc save;
        GdkPixbufModuleSaveCallbackFunc save_to_callback;
        GdkPixbufModuleSaveOptionSupportedFunc is_save_option_supported;

        /*< private >*/
        void (*_reserved1) (void);
        void (*_reserved2) (void);
        void (*_reserved3) (void);
        void (*_reserved4) (void);
};

/**
 * GdkPixbufModuleFillVtableFunc:
 * @module: a #GdkPixbufModule.
 * 
 * Defines the type of the function used to set the vtable of a 
 * #GdkPixbufModule when it is loaded. 
 * 
 * Since: 2.2
 */
typedef void (* GdkPixbufModuleFillVtableFunc) (GdkPixbufModule *module);

/**
 * GdkPixbufModuleFillInfoFunc:
 * @info: a #GdkPixbufFormat.
 * 
 * Defines the type of the function used to fill a 
 * #GdkPixbufFormat structure with information about a module.
 * 
 * Since: 2.2
 */
typedef void (* GdkPixbufModuleFillInfoFunc) (GdkPixbufFormat *info);

/**
 * GdkPixbufFormatFlags:
 * @GDK_PIXBUF_FORMAT_WRITABLE: the module can write out images in the format.
 * @GDK_PIXBUF_FORMAT_SCALABLE: the image format is scalable
 * @GDK_PIXBUF_FORMAT_THREADSAFE: the module is threadsafe. gdk-pixbuf
 *     ignores modules that are not marked as threadsafe. (Since 2.28).
 * 
 * Flags which allow a module to specify further details about the supported
 * operations.
 * 
 * Since: 2.2
 */
typedef enum /*< skip >*/
{
  GDK_PIXBUF_FORMAT_WRITABLE = 1 << 0,
  GDK_PIXBUF_FORMAT_SCALABLE = 1 << 1,
  GDK_PIXBUF_FORMAT_THREADSAFE = 1 << 2
} GdkPixbufFormatFlags;

/**
 * GdkPixbufFormat:
 * @name: the name of the image format
 * @signature: the signature of the module
 * @domain: the message domain for the `description`
 * @description: a description of the image format
 * @mime_types: (array zero-terminated=1): the MIME types for the image format
 * @extensions: (array zero-terminated=1): typical filename extensions for the
 *   image format
 * @flags: a combination of `GdkPixbufFormatFlags`
 * @disabled: a boolean determining whether the loader is disabled`
 * @license: a string containing license information, typically set to 
 *   shorthands like "GPL", "LGPL", etc.
 * 
 * A `GdkPixbufFormat` contains information about the image format accepted
 * by a module.
 *
 * Only modules should access the fields directly, applications should
 * use the `gdk_pixbuf_format_*` family of functions.
 * 
 * Since: 2.2
 */
struct _GdkPixbufFormat {
  gchar *name;
  GdkPixbufModulePattern *signature;
  gchar *domain;
  gchar *description;
  gchar **mime_types;
  gchar **extensions;
  guint32 flags;
  gboolean disabled;
  gchar *license;
};

#endif /* GDK_PIXBUF_ENABLE_BACKEND */

G_END_DECLS

#endif /* GDK_PIXBUF_IO_H */
