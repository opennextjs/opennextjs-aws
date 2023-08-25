/* GLIB - Library of useful routines for C programming
 * Copyright (C) 1995-1997  Peter Mattis, Spencer Kimball and Josh MacDonald
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
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, see <http://www.gnu.org/licenses/>.
 */

/*
 * Modified by the GLib Team and others 1997-2000.  See the AUTHORS
 * file for a list of people on the GLib Team.  See the ChangeLog
 * files for a list of changes.  These files are distributed with
 * GLib at ftp://ftp.gtk.org/pub/gtk/.
 */

#ifndef __G_UTILS_H__
#define __G_UTILS_H__

#if !defined (__GLIB_H_INSIDE__) && !defined (GLIB_COMPILATION)
#error "Only <glib.h> can be included directly."
#endif

#include <glib/gtypes.h>
#include <stdarg.h>

G_BEGIN_DECLS

GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_user_name        (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_real_name        (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_home_dir         (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_tmp_dir          (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_host_name	     (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_prgname          (void);
GLIB_AVAILABLE_IN_ALL
void                  g_set_prgname          (const gchar *prgname);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_application_name (void);
GLIB_AVAILABLE_IN_ALL
void                  g_set_application_name (const gchar *application_name);
GLIB_AVAILABLE_IN_2_64
gchar *               g_get_os_info          (const gchar *key_name);

/**
 * G_OS_INFO_KEY_NAME:
 *
 * A key to get the name of the operating system excluding version information suitable for presentation to the user, e.g. "YoYoOS"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_NAME \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "NAME"

/**
 * G_OS_INFO_KEY_PRETTY_NAME:
 *
 * A key to get the name of the operating system in a format suitable for presentation to the user, e.g. "YoYoOS Foo"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_PRETTY_NAME \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "PRETTY_NAME"

/**
 * G_OS_INFO_KEY_VERSION:
 *
 * A key to get the operating system version suitable for presentation to the user, e.g. "42 (Foo)"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_VERSION \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "VERSION"

/**
 * G_OS_INFO_KEY_VERSION_CODENAME:
 *
 * A key to get a codename identifying the operating system release suitable for processing by scripts or usage in generated filenames, e.g. "foo"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_VERSION_CODENAME \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "VERSION_CODENAME"

/**
 * G_OS_INFO_KEY_VERSION_ID:
 *
 * A key to get the version of the operating system suitable for processing by scripts or usage in generated filenames, e.g. "42"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_VERSION_ID \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "VERSION_ID"

/**
 * G_OS_INFO_KEY_ID:
 *
 * A key to get an ID identifying the operating system suitable for processing by scripts or usage in generated filenames, e.g. "yoyoos"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_ID \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "ID"

/**
 * G_OS_INFO_KEY_HOME_URL:
 *
 * A key to get the homepage for the operating system, e.g. "https://www.yoyo-os.com/"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_HOME_URL \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "HOME_URL"

/**
 * G_OS_INFO_KEY_DOCUMENTATION_URL:
 *
 * A key to get the documentation page for the operating system, e.g. "https://docs.yoyo-os.com/"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_DOCUMENTATION_URL \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "DOCUMENTATION_URL"

/**
 * G_OS_INFO_KEY_SUPPORT_URL:
 *
 * A key to get the support page for the operating system, e.g. "https://support.yoyo-os.com/"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_SUPPORT_URL \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "SUPPORT_URL"

/**
 * G_OS_INFO_KEY_BUG_REPORT_URL:
 *
 * A key to get the bug reporting page for the operating system, e.g. "https://bugs.yoyo-os.com/"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_BUG_REPORT_URL \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "BUG_REPORT_URL"

/**
 * G_OS_INFO_KEY_PRIVACY_POLICY_URL:
 *
 * A key to get the privacy policy for the operating system, e.g. "https://privacy.yoyo-os.com/"
 *
 * Since: 2.64
 */
#define G_OS_INFO_KEY_PRIVACY_POLICY_URL \
    GLIB_AVAILABLE_MACRO_IN_2_64 \
    "PRIVACY_POLICY_URL"

GLIB_AVAILABLE_IN_ALL
void      g_reload_user_special_dirs_cache     (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_user_data_dir      (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_user_config_dir    (void);
GLIB_AVAILABLE_IN_ALL
const gchar *         g_get_user_cache_dir     (void);
GLIB_AVAILABLE_IN_2_72
const gchar *         g_get_user_state_dir     (void);
GLIB_AVAILABLE_IN_ALL
const gchar * const * g_get_system_data_dirs   (void);

#ifdef G_OS_WIN32
/* This function is not part of the public GLib API */
GLIB_AVAILABLE_IN_ALL
const gchar * const * g_win32_get_system_data_dirs_for_module (void (*address_of_function)(void));
#endif

#if defined (G_OS_WIN32) && defined (G_CAN_INLINE)
/* This function is not part of the public GLib API either. Just call
 * g_get_system_data_dirs() in your code, never mind that that is
 * actually a macro and you will in fact call this inline function.
 */
static inline const gchar * const *
_g_win32_get_system_data_dirs (void)
{
  return g_win32_get_system_data_dirs_for_module ((void (*)(void)) &_g_win32_get_system_data_dirs);
}
#define g_get_system_data_dirs _g_win32_get_system_data_dirs
#endif

GLIB_AVAILABLE_IN_ALL
const gchar * const * g_get_system_config_dirs (void);

GLIB_AVAILABLE_IN_ALL
const gchar * g_get_user_runtime_dir (void);

/**
 * GUserDirectory:
 * @G_USER_DIRECTORY_DESKTOP: the user's Desktop directory
 * @G_USER_DIRECTORY_DOCUMENTS: the user's Documents directory
 * @G_USER_DIRECTORY_DOWNLOAD: the user's Downloads directory
 * @G_USER_DIRECTORY_MUSIC: the user's Music directory
 * @G_USER_DIRECTORY_PICTURES: the user's Pictures directory
 * @G_USER_DIRECTORY_PUBLIC_SHARE: the user's shared directory
 * @G_USER_DIRECTORY_TEMPLATES: the user's Templates directory
 * @G_USER_DIRECTORY_VIDEOS: the user's Movies directory
 * @G_USER_N_DIRECTORIES: the number of enum values
 *
 * These are logical ids for special directories which are defined
 * depending on the platform used. You should use g_get_user_special_dir()
 * to retrieve the full path associated to the logical id.
 *
 * The #GUserDirectory enumeration can be extended at later date. Not
 * every platform has a directory for every logical id in this
 * enumeration.
 *
 * Since: 2.14
 */
typedef enum {
  G_USER_DIRECTORY_DESKTOP,
  G_USER_DIRECTORY_DOCUMENTS,
  G_USER_DIRECTORY_DOWNLOAD,
  G_USER_DIRECTORY_MUSIC,
  G_USER_DIRECTORY_PICTURES,
  G_USER_DIRECTORY_PUBLIC_SHARE,
  G_USER_DIRECTORY_TEMPLATES,
  G_USER_DIRECTORY_VIDEOS,

  G_USER_N_DIRECTORIES
} GUserDirectory;

GLIB_AVAILABLE_IN_ALL
const gchar * g_get_user_special_dir (GUserDirectory directory);

/**
 * GDebugKey:
 * @key: the string
 * @value: the flag
 *
 * Associates a string with a bit flag.
 * Used in g_parse_debug_string().
 */
typedef struct _GDebugKey GDebugKey;
struct _GDebugKey
{
  const gchar *key;
  guint	       value;
};

/* Miscellaneous utility functions
 */
GLIB_AVAILABLE_IN_ALL
guint                 g_parse_debug_string (const gchar     *string,
					    const GDebugKey *keys,
					    guint            nkeys);

GLIB_AVAILABLE_IN_ALL
gint                  g_snprintf           (gchar       *string,
					    gulong       n,
					    gchar const *format,
					    ...) G_GNUC_PRINTF (3, 4);
GLIB_AVAILABLE_IN_ALL
gint                  g_vsnprintf          (gchar       *string,
					    gulong       n,
					    gchar const *format,
					    va_list      args)
					    G_GNUC_PRINTF(3, 0);

GLIB_AVAILABLE_IN_ALL
void                  g_nullify_pointer    (gpointer    *nullify_location);

typedef enum
{
  G_FORMAT_SIZE_DEFAULT     = 0,
  G_FORMAT_SIZE_LONG_FORMAT = 1 << 0,
  G_FORMAT_SIZE_IEC_UNITS   = 1 << 1,
  G_FORMAT_SIZE_BITS        = 1 << 2,
  G_FORMAT_SIZE_ONLY_VALUE GLIB_AVAILABLE_ENUMERATOR_IN_2_74 = 1 << 3,
  G_FORMAT_SIZE_ONLY_UNIT GLIB_AVAILABLE_ENUMERATOR_IN_2_74 = 1 << 4
} GFormatSizeFlags;

GLIB_AVAILABLE_IN_2_30
gchar *g_format_size_full   (guint64          size,
                             GFormatSizeFlags flags);
GLIB_AVAILABLE_IN_2_30
gchar *g_format_size        (guint64          size);

GLIB_DEPRECATED_IN_2_30_FOR(g_format_size)
gchar *g_format_size_for_display (goffset size);

#define g_ATEXIT(proc)	(atexit (proc)) GLIB_DEPRECATED_MACRO_IN_2_32
#define g_memmove(dest,src,len) \
  G_STMT_START { memmove ((dest), (src), (len)); } G_STMT_END  GLIB_DEPRECATED_MACRO_IN_2_40_FOR(memmove)

/**
 * GVoidFunc:
 *
 * Declares a type of function which takes no arguments
 * and has no return value. It is used to specify the type
 * function passed to g_atexit().
 */
typedef void (*GVoidFunc) (void) GLIB_DEPRECATED_TYPE_IN_2_32;
#define ATEXIT(proc) g_ATEXIT(proc) GLIB_DEPRECATED_MACRO_IN_2_32

G_GNUC_BEGIN_IGNORE_DEPRECATIONS
GLIB_DEPRECATED
void	g_atexit		(GVoidFunc    func);
G_GNUC_END_IGNORE_DEPRECATIONS

#ifdef G_OS_WIN32
/* It's a bad idea to wrap atexit() on Windows. If the GLib DLL calls
 * atexit(), the function will be called when the GLib DLL is detached
 * from the program, which is not what the caller wants. The caller
 * wants the function to be called when it *itself* exits (or is
 * detached, in case the caller, too, is a DLL).
 */
#if (defined(__MINGW_H) && !defined(_STDLIB_H_)) || (defined(_MSC_VER) && !defined(_INC_STDLIB))
int atexit (void (*)(void));
#endif
#define g_atexit(func) atexit(func) GLIB_DEPRECATED_MACRO_IN_2_32
#endif


/* Look for an executable in PATH, following execvp() rules */
GLIB_AVAILABLE_IN_ALL
gchar*  g_find_program_in_path  (const gchar *program);

/* Bit tests
 *
 * These are defined in a convoluted way because we want the compiler to
 * be able to inline the code for performance reasons, but for
 * historical reasons, we must continue to provide non-inline versions
 * on our ABI.
 *
 * We define these as functions in gutils.c which are just implemented
 * as calls to the _impl() versions in order to preserve the ABI.
 */

#define g_bit_nth_lsf(mask, nth_bit) g_bit_nth_lsf_impl(mask, nth_bit)
#define g_bit_nth_msf(mask, nth_bit) g_bit_nth_msf_impl(mask, nth_bit)
#define g_bit_storage(number)        g_bit_storage_impl(number)

GLIB_AVAILABLE_IN_ALL
gint    (g_bit_nth_lsf)         (gulong mask,
                                 gint   nth_bit);
GLIB_AVAILABLE_IN_ALL
gint    (g_bit_nth_msf)         (gulong mask,
                                 gint   nth_bit);
GLIB_AVAILABLE_IN_ALL
guint   (g_bit_storage)         (gulong number);

static inline gint
g_bit_nth_lsf_impl (gulong mask,
                    gint   nth_bit)
{
  if (G_UNLIKELY (nth_bit < -1))
    nth_bit = -1;
  while (nth_bit < ((GLIB_SIZEOF_LONG * 8) - 1))
    {
      nth_bit++;
      if (mask & (1UL << nth_bit))
        return nth_bit;
    }
  return -1;
}

static inline gint
g_bit_nth_msf_impl (gulong mask,
                    gint   nth_bit)
{
  if (nth_bit < 0 || G_UNLIKELY (nth_bit > GLIB_SIZEOF_LONG * 8))
    nth_bit = GLIB_SIZEOF_LONG * 8;
  while (nth_bit > 0)
    {
      nth_bit--;
      if (mask & (1UL << nth_bit))
        return nth_bit;
    }
  return -1;
}

static inline guint
g_bit_storage_impl (gulong number)
{
#if defined(__GNUC__) && (__GNUC__ >= 4) && defined(__OPTIMIZE__)
  return G_LIKELY (number) ?
           ((GLIB_SIZEOF_LONG * 8U - 1) ^ (guint) __builtin_clzl(number)) + 1 : 1;
#else
  guint n_bits = 0;

  do
    {
      n_bits++;
      number >>= 1;
    }
  while (number);
  return n_bits;
#endif
}

/* Crashes the program. */
#if GLIB_VERSION_MAX_ALLOWED >= GLIB_VERSION_2_50
#ifndef G_OS_WIN32
#  include <stdlib.h>
#  define g_abort() abort ()
#else
G_NORETURN GLIB_AVAILABLE_IN_2_50 void g_abort (void) G_ANALYZER_NORETURN;
#endif
#endif

/*
 * This macro is deprecated. This DllMain() is too complex. It is
 * recommended to write an explicit minimal DLlMain() that just saves
 * the handle to the DLL and then use that handle instead, for
 * instance passing it to
 * g_win32_get_package_installation_directory_of_module().
 *
 * On Windows, this macro defines a DllMain function that stores the
 * actual DLL name that the code being compiled will be included in.
 * STATIC should be empty or 'static'. DLL_NAME is the name of the
 * (pointer to the) char array where the DLL name will be stored. If
 * this is used, you must also include <windows.h>. If you need a more complex
 * DLL entry point function, you cannot use this.
 *
 * On non-Windows platforms, expands to nothing.
 */

#ifndef G_PLATFORM_WIN32
# define G_WIN32_DLLMAIN_FOR_DLL_NAME(static, dll_name) GLIB_DEPRECATED_MACRO_IN_2_26
#else
# define G_WIN32_DLLMAIN_FOR_DLL_NAME(static, dll_name)			\
static char *dll_name;							\
									\
BOOL WINAPI								\
DllMain (HINSTANCE hinstDLL,						\
	 DWORD     fdwReason,						\
	 LPVOID    lpvReserved)						\
{									\
  wchar_t wcbfr[1000];							\
  char *tem;								\
  switch (fdwReason)							\
    {									\
    case DLL_PROCESS_ATTACH:						\
      GetModuleFileNameW ((HMODULE) hinstDLL, wcbfr, G_N_ELEMENTS (wcbfr)); \
      tem = g_utf16_to_utf8 (wcbfr, -1, NULL, NULL, NULL);		\
      dll_name = g_path_get_basename (tem);				\
      g_free (tem);							\
      break;								\
    }									\
									\
  return TRUE;								\
} GLIB_DEPRECATED_MACRO_IN_2_26
#endif /* G_PLATFORM_WIN32 */

G_END_DECLS

#endif /* __G_UTILS_H__ */
