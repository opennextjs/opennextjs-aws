/* GLib testing utilities
 * Copyright (C) 2007 Imendio AB
 * Authors: Tim Janik
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

#ifndef __G_TEST_UTILS_H__
#define __G_TEST_UTILS_H__

#if !defined (__GLIB_H_INSIDE__) && !defined (GLIB_COMPILATION)
#error "Only <glib.h> can be included directly."
#endif

#include <glib/gmessages.h>
#include <glib/gstring.h>
#include <glib/gerror.h>
#include <glib/gslist.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>

G_BEGIN_DECLS

typedef struct GTestCase  GTestCase;
typedef struct GTestSuite GTestSuite;
typedef void (*GTestFunc)        (void);
typedef void (*GTestDataFunc)    (gconstpointer user_data);
typedef void (*GTestFixtureFunc) (gpointer      fixture,
                                  gconstpointer user_data);

/* assertion API */
#define g_assert_cmpstr(s1, cmp, s2)    G_STMT_START { \
                                             const char *__s1 = (s1), *__s2 = (s2); \
                                             if (g_strcmp0 (__s1, __s2) cmp 0) ; else \
                                               g_assertion_message_cmpstr (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #s1 " " #cmp " " #s2, __s1, #cmp, __s2); \
                                        } G_STMT_END
#if GLIB_VERSION_MIN_REQUIRED >= GLIB_VERSION_2_78
#define g_assert_cmpint(n1, cmp, n2)    G_STMT_START { \
                                             gint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpint (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, __n1, #cmp, __n2, 'i'); \
                                        } G_STMT_END
#define g_assert_cmpuint(n1, cmp, n2)   G_STMT_START { \
                                             guint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpint (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, __n1, #cmp, __n2, 'u'); \
                                        } G_STMT_END
#define g_assert_cmphex(n1, cmp, n2)    G_STMT_START { \
                                             guint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpint (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, __n1, #cmp, __n2, 'x'); \
                                        } G_STMT_END
#else /* GLIB_VERSION_MIN_REQUIRED < GLIB_VERSION_2_78 */
#define g_assert_cmpint(n1, cmp, n2)    G_STMT_START { \
                                             gint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, (long double) __n1, #cmp, (long double) __n2, 'i'); \
                                        } G_STMT_END
#define g_assert_cmpuint(n1, cmp, n2)   G_STMT_START { \
                                             guint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, (long double) __n1, #cmp, (long double) __n2, 'i'); \
                                        } G_STMT_END
#define g_assert_cmphex(n1, cmp, n2)    G_STMT_START {\
                                             guint64 __n1 = (n1), __n2 = (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, (long double) __n1, #cmp, (long double) __n2, 'x'); \
                                        } G_STMT_END
#endif /* GLIB_VERSION_MIN_REQUIRED >= GLIB_VERSION_2_78 */
#define g_assert_cmpfloat(n1,cmp,n2)    G_STMT_START { \
                                             long double __n1 = (long double) (n1), __n2 = (long double) (n2); \
                                             if (__n1 cmp __n2) ; else \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " " #cmp " " #n2, (long double) __n1, #cmp, (long double) __n2, 'f'); \
                                        } G_STMT_END
#define g_assert_cmpfloat_with_epsilon(n1,n2,epsilon) \
                                        G_STMT_START { \
                                             double __n1 = (n1), __n2 = (n2), __epsilon = (epsilon); \
                                             if (G_APPROX_VALUE (__n1,  __n2, __epsilon)) ; else \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #n1 " == " #n2 " (+/- " #epsilon ")", __n1, "==", __n2, 'f'); \
                                        } G_STMT_END
#if GLIB_VERSION_MIN_REQUIRED >= GLIB_VERSION_2_78
#define g_assert_cmpmem(m1, l1, m2, l2) G_STMT_START {\
                                             gconstpointer __m1 = m1, __m2 = m2; \
                                             size_t __l1 = (size_t) l1, __l2 = (size_t) l2; \
                                             if (__l1 != 0 && __m1 == NULL) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #l1 " == 0 || " #m1 " != NULL)"); \
                                             else if (__l2 != 0 && __m2 == NULL) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #l2 " == 0 || " #m2 " != NULL)"); \
                                             else if (__l1 != __l2) \
                                               g_assertion_message_cmpint (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                           #l1 " (len(" #m1 ")) == " #l2 " (len(" #m2 "))", \
                                                                           __l1, "==", __l2, 'u'); \
                                             else if (__l1 != 0 && __m2 != NULL && memcmp (__m1, __m2, __l1) != 0) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #m1 " == " #m2 ")"); \
                                        } G_STMT_END
#else /* GLIB_VERSION_MIN_REQUIRED < GLIB_VERSION_2_78 */
#define g_assert_cmpmem(m1, l1, m2, l2) G_STMT_START {\
                                             gconstpointer __m1 = m1, __m2 = m2; \
                                             size_t __l1 = (size_t) l1, __l2 = (size_t) l2; \
                                             if (__l1 != 0 && __m1 == NULL) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #l1 " == 0 || " #m1 " != NULL)"); \
                                             else if (__l2 != 0 && __m2 == NULL) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #l2 " == 0 || " #m2 " != NULL)"); \
                                             else if (__l1 != __l2) \
                                               g_assertion_message_cmpnum (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                           #l1 " (len(" #m1 ")) == " #l2 " (len(" #m2 "))", \
                                                                           (long double) __l1, "==", (long double) __l2, 'i'); \
                                             else if (__l1 != 0 && __m2 != NULL && memcmp (__m1, __m2, __l1) != 0) \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "assertion failed (" #m1 " == " #m2 ")"); \
                                        } G_STMT_END
#endif /* GLIB_VERSION_MIN_REQUIRED >= GLIB_VERSION_2_78 */
#define g_assert_cmpvariant(v1, v2) \
  G_STMT_START \
  { \
    GVariant *__v1 = (v1), *__v2 = (v2); \
    if (!g_variant_equal (__v1, __v2)) \
      { \
        gchar *__s1, *__s2, *__msg; \
        __s1 = g_variant_print (__v1, TRUE); \
        __s2 = g_variant_print (__v2, TRUE); \
        __msg = g_strdup_printf ("assertion failed (" #v1 " == " #v2 "): %s does not equal %s", __s1, __s2); \
        g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, __msg); \
        g_free (__s1); \
        g_free (__s2); \
        g_free (__msg); \
      } \
  } \
  G_STMT_END
#define g_assert_cmpstrv(strv1, strv2) \
  G_STMT_START \
  { \
    const char * const *__strv1 = (const char * const *) (strv1); \
    const char * const *__strv2 = (const char * const *) (strv2); \
    if (!__strv1 || !__strv2) \
      { \
        if (__strv1) \
          { \
            g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                 "assertion failed (" #strv1 " == " #strv2 "): " #strv2 " is NULL, but " #strv1 " is not"); \
          } \
        else if (__strv2) \
          { \
            g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                 "assertion failed (" #strv1 " == " #strv2 "): " #strv1 " is NULL, but " #strv2 " is not"); \
          } \
      } \
    else \
      { \
        guint __l1 = g_strv_length ((char **) __strv1); \
        guint __l2 = g_strv_length ((char **) __strv2); \
        if (__l1 != __l2) \
          { \
            char *__msg; \
            __msg = g_strdup_printf ("assertion failed (" #strv1 " == " #strv2 "): length %u does not equal length %u", __l1, __l2); \
            g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, __msg); \
            g_free (__msg); \
          } \
        else \
          { \
            guint __i; \
            for (__i = 0; __i < __l1; __i++) \
              { \
                if (g_strcmp0 (__strv1[__i], __strv2[__i]) != 0) \
                  { \
                    g_assertion_message_cmpstrv (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #strv1 " == " #strv2, \
                                                 __strv1, __strv2, __i); \
                  } \
              } \
          } \
      } \
  } \
  G_STMT_END
#define g_assert_no_errno(expr)         G_STMT_START { \
                                             int __ret, __errsv; \
                                             errno = 0; \
                                             __ret = expr; \
                                             __errsv = errno; \
                                             if (__ret < 0) \
                                               { \
                                                 gchar *__msg; \
                                                 __msg = g_strdup_printf ("assertion failed (" #expr " >= 0): errno %i: %s", __errsv, g_strerror (__errsv)); \
                                                 g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, __msg); \
                                                 g_free (__msg); \
                                               } \
                                        } G_STMT_END \
                                        GLIB_AVAILABLE_MACRO_IN_2_66
#define g_assert_no_error(err)          G_STMT_START { \
                                             if (err) \
                                               g_assertion_message_error (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #err, err, 0, 0); \
                                        } G_STMT_END
#define g_assert_error(err, dom, c)     G_STMT_START { \
                                               if (!err || (err)->domain != dom || (err)->code != c) \
                                               g_assertion_message_error (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                 #err, err, dom, c); \
                                        } G_STMT_END
#define g_assert_true(expr)             G_STMT_START { \
                                             if G_LIKELY (expr) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should be TRUE"); \
                                        } G_STMT_END
#define g_assert_false(expr)            G_STMT_START { \
                                             if G_LIKELY (!(expr)) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should be FALSE"); \
                                        } G_STMT_END

/* Use nullptr in C++ to catch misuse of these macros. */
#if G_CXX_STD_CHECK_VERSION (11)
#define g_assert_null(expr)             G_STMT_START { if G_LIKELY ((expr) == nullptr) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should be nullptr"); \
                                        } G_STMT_END
#define g_assert_nonnull(expr)          G_STMT_START { \
                                             if G_LIKELY ((expr) != nullptr) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should not be nullptr"); \
                                        } G_STMT_END
#else /* not C++ */
#define g_assert_null(expr)             G_STMT_START { if G_LIKELY ((expr) == NULL) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should be NULL"); \
                                        } G_STMT_END
#define g_assert_nonnull(expr)          G_STMT_START { \
                                             if G_LIKELY ((expr) != NULL) ; else \
                                               g_assertion_message (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                    "'" #expr "' should not be NULL"); \
                                        } G_STMT_END
#endif

#ifdef G_DISABLE_ASSERT
/* https://gcc.gnu.org/onlinedocs/gcc-8.3.0/gcc/Other-Builtins.html#index-_005f_005fbuiltin_005funreachable
 * GCC 5 is not a strict lower bound for versions of GCC which provide __builtin_unreachable(). */
#if __GNUC__ >= 5 || g_macro__has_builtin(__builtin_unreachable)
#define g_assert_not_reached()          G_STMT_START { (void) 0; __builtin_unreachable (); } G_STMT_END
#elif defined (_MSC_VER)
#define g_assert_not_reached()          G_STMT_START { (void) 0; __assume (0); } G_STMT_END
#else  /* if __builtin_unreachable() is not supported: */
#define g_assert_not_reached()          G_STMT_START { (void) 0; } G_STMT_END
#endif

#define g_assert(expr)                  G_STMT_START { (void) 0; } G_STMT_END
#else /* !G_DISABLE_ASSERT */
#define g_assert_not_reached()          G_STMT_START { g_assertion_message_expr (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, NULL); } G_STMT_END
#define g_assert(expr)                  G_STMT_START { \
                                             if G_LIKELY (expr) ; else \
                                               g_assertion_message_expr (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, \
                                                                         #expr); \
                                        } G_STMT_END
#endif /* !G_DISABLE_ASSERT */

GLIB_AVAILABLE_IN_ALL
int     g_strcmp0                       (const char     *str1,
                                         const char     *str2);

/* report performance results */
GLIB_AVAILABLE_IN_ALL
void    g_test_minimized_result         (double          minimized_quantity,
                                         const char     *format,
                                         ...) G_GNUC_PRINTF (2, 3);
GLIB_AVAILABLE_IN_ALL
void    g_test_maximized_result         (double          maximized_quantity,
                                         const char     *format,
                                         ...) G_GNUC_PRINTF (2, 3);

/* initialize testing framework */
GLIB_AVAILABLE_IN_ALL
void    g_test_init                     (int            *argc,
                                         char         ***argv,
                                         ...) G_GNUC_NULL_TERMINATED;

/**
 * G_TEST_OPTION_ISOLATE_DIRS:
 *
 * Creates a unique temporary directory for each unit test and uses
 * g_set_user_dirs() to set XDG directories to point into subdirectories of it
 * for the duration of the unit test. The directory tree is cleaned up after the
 * test finishes successfully. Note that this doesn’t take effect until
 * g_test_run() is called, so calls to (for example) g_get_user_home_dir() will
 * return the system-wide value when made in a test program’s main() function.
 *
 * The following functions will return subdirectories of the temporary directory
 * when this option is used. The specific subdirectory paths in use are not
 * guaranteed to be stable API — always use a getter function to retrieve them.
 *
 *  - g_get_home_dir()
 *  - g_get_user_cache_dir()
 *  - g_get_system_config_dirs()
 *  - g_get_user_config_dir()
 *  - g_get_system_data_dirs()
 *  - g_get_user_data_dir()
 *  - g_get_user_state_dir()
 *  - g_get_user_runtime_dir()
 *
 * The subdirectories may not be created by the test harness; as with normal
 * calls to functions like g_get_user_cache_dir(), the caller must be prepared
 * to create the directory if it doesn’t exist.
 *
 * Since: 2.60
 */
#define G_TEST_OPTION_ISOLATE_DIRS "isolate_dirs"

/* While we discourage its use, g_assert() is often used in unit tests
 * (especially in legacy code). g_assert_*() should really be used instead.
 * g_assert() can be disabled at client program compile time, which can render
 * tests useless. Highlight that to the user. */
#ifdef G_DISABLE_ASSERT
#if defined(G_HAVE_ISO_VARARGS)
#define g_test_init(argc, argv, ...) \
  G_STMT_START { \
    g_printerr ("Tests were compiled with G_DISABLE_ASSERT and are likely no-ops. Aborting.\n"); \
    exit (1); \
  } G_STMT_END
#elif defined(G_HAVE_GNUC_VARARGS)
#define g_test_init(argc, argv...) \
  G_STMT_START { \
    g_printerr ("Tests were compiled with G_DISABLE_ASSERT and are likely no-ops. Aborting.\n"); \
    exit (1); \
  } G_STMT_END
#else  /* no varargs */
  /* do nothing */
#endif  /* varargs support */
#endif  /* G_DISABLE_ASSERT */

/* query testing framework config */
#define g_test_initialized()            (g_test_config_vars->test_initialized)
#define g_test_quick()                  (g_test_config_vars->test_quick)
#define g_test_slow()                   (!g_test_config_vars->test_quick)
#define g_test_thorough()               (!g_test_config_vars->test_quick)
#define g_test_perf()                   (g_test_config_vars->test_perf)
#define g_test_verbose()                (g_test_config_vars->test_verbose)
#define g_test_quiet()                  (g_test_config_vars->test_quiet)
#define g_test_undefined()              (g_test_config_vars->test_undefined)
GLIB_AVAILABLE_IN_2_38
gboolean g_test_subprocess (void);

/* run all tests under toplevel suite (path: /) */
GLIB_AVAILABLE_IN_ALL
int     g_test_run                      (void);
/* hook up a test functions under test path */
GLIB_AVAILABLE_IN_ALL
void    g_test_add_func                 (const char     *testpath,
                                         GTestFunc       test_func);

GLIB_AVAILABLE_IN_ALL
void    g_test_add_data_func            (const char     *testpath,
                                         gconstpointer   test_data,
                                         GTestDataFunc   test_func);

GLIB_AVAILABLE_IN_2_34
void    g_test_add_data_func_full       (const char     *testpath,
                                         gpointer        test_data,
                                         GTestDataFunc   test_func,
                                         GDestroyNotify  data_free_func);

/* tell about currently run test */
GLIB_AVAILABLE_IN_2_68
const char * g_test_get_path            (void);

/* tell about failure */
GLIB_AVAILABLE_IN_2_30
void    g_test_fail                     (void);
GLIB_AVAILABLE_IN_2_70
void    g_test_fail_printf              (const char *format,
                                         ...) G_GNUC_PRINTF (1, 2);
GLIB_AVAILABLE_IN_2_38
void    g_test_incomplete               (const gchar *msg);
GLIB_AVAILABLE_IN_2_70
void    g_test_incomplete_printf        (const char *format,
                                         ...) G_GNUC_PRINTF (1, 2);
GLIB_AVAILABLE_IN_2_38
void    g_test_skip                     (const gchar *msg);
GLIB_AVAILABLE_IN_2_70
void    g_test_skip_printf              (const char *format,
                                         ...) G_GNUC_PRINTF (1, 2);
GLIB_AVAILABLE_IN_2_38
gboolean g_test_failed                  (void);
GLIB_AVAILABLE_IN_2_38
void    g_test_set_nonfatal_assertions  (void);
GLIB_AVAILABLE_IN_2_78
void    g_test_disable_crash_reporting  (void);

/**
 * g_test_add:
 * @testpath:  The test path for a new test case.
 * @Fixture:   The type of a fixture data structure.
 * @tdata:     Data argument for the test functions.
 * @fsetup:    The function to set up the fixture data.
 * @ftest:     The actual test function.
 * @fteardown: The function to tear down the fixture data.
 *
 * Hook up a new test case at @testpath, similar to g_test_add_func().
 * A fixture data structure with setup and teardown functions may be provided,
 * similar to g_test_create_case().
 *
 * g_test_add() is implemented as a macro, so that the fsetup(), ftest() and
 * fteardown() callbacks can expect a @Fixture pointer as their first argument
 * in a type safe manner. They otherwise have type #GTestFixtureFunc.
 *
 * Since: 2.16
 */
#define g_test_add(testpath, Fixture, tdata, fsetup, ftest, fteardown) \
					G_STMT_START {			\
                                         void (*add_vtable) (const char*,       \
                                                    gsize,             \
                                                    gconstpointer,     \
                                                    void (*) (Fixture*, gconstpointer),   \
                                                    void (*) (Fixture*, gconstpointer),   \
                                                    void (*) (Fixture*, gconstpointer)) =  (void (*) (const gchar *, gsize, gconstpointer, void (*) (Fixture*, gconstpointer), void (*) (Fixture*, gconstpointer), void (*) (Fixture*, gconstpointer))) g_test_add_vtable; \
                                         add_vtable \
                                          (testpath, sizeof (Fixture), tdata, fsetup, ftest, fteardown); \
					} G_STMT_END

/* add test messages to the test report */
GLIB_AVAILABLE_IN_ALL
void    g_test_message                  (const char *format,
                                         ...) G_GNUC_PRINTF (1, 2);
GLIB_AVAILABLE_IN_ALL
void    g_test_bug_base                 (const char *uri_pattern);
GLIB_AVAILABLE_IN_ALL
void    g_test_bug                      (const char *bug_uri_snippet);
GLIB_AVAILABLE_IN_2_62
void    g_test_summary                  (const char *summary);
/* measure test timings */
GLIB_AVAILABLE_IN_ALL
void    g_test_timer_start              (void);
GLIB_AVAILABLE_IN_ALL
double  g_test_timer_elapsed            (void); /* elapsed seconds */
GLIB_AVAILABLE_IN_ALL
double  g_test_timer_last               (void); /* repeat last elapsed() result */

/* automatically g_free or g_object_unref upon teardown */
GLIB_AVAILABLE_IN_ALL
void    g_test_queue_free               (gpointer gfree_pointer);
GLIB_AVAILABLE_IN_ALL
void    g_test_queue_destroy            (GDestroyNotify destroy_func,
                                         gpointer       destroy_data);
#define g_test_queue_unref(gobject)     g_test_queue_destroy (g_object_unref, gobject)

/**
 * GTestTrapFlags:
 * @G_TEST_TRAP_DEFAULT: Default behaviour. Since: 2.74
 * @G_TEST_TRAP_SILENCE_STDOUT: Redirect stdout of the test child to
 *     `/dev/null` so it cannot be observed on the console during test
 *     runs. The actual output is still captured though to allow later
 *     tests with g_test_trap_assert_stdout().
 * @G_TEST_TRAP_SILENCE_STDERR: Redirect stderr of the test child to
 *     `/dev/null` so it cannot be observed on the console during test
 *     runs. The actual output is still captured though to allow later
 *     tests with g_test_trap_assert_stderr().
 * @G_TEST_TRAP_INHERIT_STDIN: If this flag is given, stdin of the
 *     child process is shared with stdin of its parent process.
 *     It is redirected to `/dev/null` otherwise.
 *
 * Test traps are guards around forked tests.
 * These flags determine what traps to set.
 *
 * Deprecated: 2.38: #GTestTrapFlags is used only with g_test_trap_fork(),
 * which is deprecated. g_test_trap_subprocess() uses
 * #GTestSubprocessFlags.
 */
typedef enum {
  G_TEST_TRAP_DEFAULT GLIB_AVAILABLE_ENUMERATOR_IN_2_74 = 0,
  G_TEST_TRAP_SILENCE_STDOUT    = 1 << 7,
  G_TEST_TRAP_SILENCE_STDERR    = 1 << 8,
  G_TEST_TRAP_INHERIT_STDIN     = 1 << 9
} GTestTrapFlags GLIB_DEPRECATED_TYPE_IN_2_38_FOR(GTestSubprocessFlags);

G_GNUC_BEGIN_IGNORE_DEPRECATIONS

GLIB_DEPRECATED_IN_2_38_FOR (g_test_trap_subprocess)
gboolean g_test_trap_fork               (guint64              usec_timeout,
                                         GTestTrapFlags       test_trap_flags);

G_GNUC_END_IGNORE_DEPRECATIONS

typedef enum {
  G_TEST_SUBPROCESS_DEFAULT GLIB_AVAILABLE_ENUMERATOR_IN_2_74 = 0,
  G_TEST_SUBPROCESS_INHERIT_STDIN  = 1 << 0,
  G_TEST_SUBPROCESS_INHERIT_STDOUT = 1 << 1,
  G_TEST_SUBPROCESS_INHERIT_STDERR = 1 << 2
} GTestSubprocessFlags;

GLIB_AVAILABLE_IN_2_38
void     g_test_trap_subprocess         (const char           *test_path,
                                         guint64               usec_timeout,
                                         GTestSubprocessFlags  test_flags);

GLIB_AVAILABLE_IN_ALL
gboolean g_test_trap_has_passed         (void);
GLIB_AVAILABLE_IN_ALL
gboolean g_test_trap_reached_timeout    (void);
#define  g_test_trap_assert_passed()                      g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 0, 0)
#define  g_test_trap_assert_failed()                      g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 1, 0)
#define  g_test_trap_assert_stdout(soutpattern)           g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 2, soutpattern)
#define  g_test_trap_assert_stdout_unmatched(soutpattern) g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 3, soutpattern)
#define  g_test_trap_assert_stderr(serrpattern)           g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 4, serrpattern)
#define  g_test_trap_assert_stderr_unmatched(serrpattern) g_test_trap_assertions (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC, 5, serrpattern)

/* provide seed-able random numbers for tests */
#define  g_test_rand_bit()              (0 != (g_test_rand_int() & (1 << 15)))
GLIB_AVAILABLE_IN_ALL
gint32   g_test_rand_int                (void);
GLIB_AVAILABLE_IN_ALL
gint32   g_test_rand_int_range          (gint32          begin,
                                         gint32          end);
GLIB_AVAILABLE_IN_ALL
double   g_test_rand_double             (void);
GLIB_AVAILABLE_IN_ALL
double   g_test_rand_double_range       (double          range_start,
                                         double          range_end);

/*
 * semi-internal API: non-documented symbols with stable ABI. You
 * should use the non-internal helper macros instead. However, for
 * compatibility reason, you may use this semi-internal API.
 */
GLIB_AVAILABLE_IN_ALL
GTestCase*    g_test_create_case        (const char       *test_name,
                                         gsize             data_size,
                                         gconstpointer     test_data,
                                         GTestFixtureFunc  data_setup,
                                         GTestFixtureFunc  data_test,
                                         GTestFixtureFunc  data_teardown);
GLIB_AVAILABLE_IN_ALL
GTestSuite*   g_test_create_suite       (const char       *suite_name);
GLIB_AVAILABLE_IN_ALL
GTestSuite*   g_test_get_root           (void);
GLIB_AVAILABLE_IN_ALL
void          g_test_suite_add          (GTestSuite     *suite,
                                         GTestCase      *test_case);
GLIB_AVAILABLE_IN_ALL
void          g_test_suite_add_suite    (GTestSuite     *suite,
                                         GTestSuite     *nestedsuite);
GLIB_AVAILABLE_IN_ALL
int           g_test_run_suite          (GTestSuite     *suite);

GLIB_AVAILABLE_IN_2_70
void          g_test_case_free          (GTestCase *test_case);

GLIB_AVAILABLE_IN_2_70
void          g_test_suite_free         (GTestSuite     *suite);

GLIB_AVAILABLE_IN_ALL
void    g_test_trap_assertions          (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         guint64         assertion_flags, /* 0-pass, 1-fail, 2-outpattern, 4-errpattern */
                                         const char     *pattern);
GLIB_AVAILABLE_IN_ALL
void    g_assertion_message             (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *message) G_ANALYZER_NORETURN;
G_NORETURN
GLIB_AVAILABLE_IN_ALL
void    g_assertion_message_expr        (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *expr);
GLIB_AVAILABLE_IN_ALL
void    g_assertion_message_cmpstr      (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *expr,
                                         const char     *arg1,
                                         const char     *cmp,
                                         const char     *arg2) G_ANALYZER_NORETURN;

GLIB_AVAILABLE_IN_2_68
void    g_assertion_message_cmpstrv     (const char         *domain,
                                         const char         *file,
                                         int                 line,
                                         const char         *func,
                                         const char         *expr,
                                         const char * const *arg1,
                                         const char * const *arg2,
                                         gsize               first_wrong_idx) G_ANALYZER_NORETURN;
GLIB_AVAILABLE_IN_2_78
void    g_assertion_message_cmpint      (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *expr,
                                         guint64         arg1,
                                         const char     *cmp,
                                         guint64         arg2,
                                         char            numtype) G_ANALYZER_NORETURN;
GLIB_AVAILABLE_IN_ALL
void    g_assertion_message_cmpnum      (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *expr,
                                         long double     arg1,
                                         const char     *cmp,
                                         long double     arg2,
                                         char            numtype) G_ANALYZER_NORETURN;
GLIB_AVAILABLE_IN_ALL
void    g_assertion_message_error       (const char     *domain,
                                         const char     *file,
                                         int             line,
                                         const char     *func,
                                         const char     *expr,
                                         const GError   *error,
                                         GQuark          error_domain,
                                         int             error_code) G_ANALYZER_NORETURN;
GLIB_AVAILABLE_IN_ALL
void    g_test_add_vtable               (const char     *testpath,
                                         gsize           data_size,
                                         gconstpointer   test_data,
                                         GTestFixtureFunc  data_setup,
                                         GTestFixtureFunc  data_test,
                                         GTestFixtureFunc  data_teardown);
typedef struct {
  gboolean      test_initialized;
  gboolean      test_quick;     /* disable thorough tests */
  gboolean      test_perf;      /* run performance tests */
  gboolean      test_verbose;   /* extra info */
  gboolean      test_quiet;     /* reduce output */
  gboolean      test_undefined; /* run tests that are meant to assert */
} GTestConfig;
GLIB_VAR const GTestConfig * const g_test_config_vars;

/* internal logging API */
typedef enum {
  G_TEST_RUN_SUCCESS,
  G_TEST_RUN_SKIPPED,
  G_TEST_RUN_FAILURE,
  G_TEST_RUN_INCOMPLETE
} GTestResult;

typedef enum {
  G_TEST_LOG_NONE,
  G_TEST_LOG_ERROR,             /* s:msg */
  G_TEST_LOG_START_BINARY,      /* s:binaryname s:seed */
  G_TEST_LOG_LIST_CASE,         /* s:testpath */
  G_TEST_LOG_SKIP_CASE,         /* s:testpath */
  G_TEST_LOG_START_CASE,        /* s:testpath */
  G_TEST_LOG_STOP_CASE,         /* d:status d:nforks d:elapsed */
  G_TEST_LOG_MIN_RESULT,        /* s:blurb d:result */
  G_TEST_LOG_MAX_RESULT,        /* s:blurb d:result */
  G_TEST_LOG_MESSAGE,           /* s:blurb */
  G_TEST_LOG_START_SUITE,
  G_TEST_LOG_STOP_SUITE
} GTestLogType;

typedef struct {
  GTestLogType  log_type;
  guint         n_strings;
  gchar       **strings; /* NULL terminated */
  guint         n_nums;
  long double  *nums;
} GTestLogMsg;
typedef struct {
  /*< private >*/
  GString     *data;
  GSList      *msgs;
} GTestLogBuffer;

GLIB_AVAILABLE_IN_ALL
const char*     g_test_log_type_name    (GTestLogType    log_type);
GLIB_AVAILABLE_IN_ALL
GTestLogBuffer* g_test_log_buffer_new   (void);
GLIB_AVAILABLE_IN_ALL
void            g_test_log_buffer_free  (GTestLogBuffer *tbuffer);
GLIB_AVAILABLE_IN_ALL
void            g_test_log_buffer_push  (GTestLogBuffer *tbuffer,
                                         guint           n_bytes,
                                         const guint8   *bytes);
GLIB_AVAILABLE_IN_ALL
GTestLogMsg*    g_test_log_buffer_pop   (GTestLogBuffer *tbuffer);
GLIB_AVAILABLE_IN_ALL
void            g_test_log_msg_free     (GTestLogMsg    *tmsg);

/**
 * GTestLogFatalFunc:
 * @log_domain: the log domain of the message
 * @log_level: the log level of the message (including the fatal and recursion flags)
 * @message: the message to process
 * @user_data: user data, set in g_test_log_set_fatal_handler()
 *
 * Specifies the prototype of fatal log handler functions.
 *
 * Returns: %TRUE if the program should abort, %FALSE otherwise
 *
 * Since: 2.22
 */
typedef gboolean        (*GTestLogFatalFunc)    (const gchar    *log_domain,
                                                 GLogLevelFlags  log_level,
                                                 const gchar    *message,
                                                 gpointer        user_data);
GLIB_AVAILABLE_IN_ALL
void
g_test_log_set_fatal_handler            (GTestLogFatalFunc log_func,
                                         gpointer          user_data);

GLIB_AVAILABLE_IN_2_34
void    g_test_expect_message                    (const gchar    *log_domain,
                                                  GLogLevelFlags  log_level,
                                                  const gchar    *pattern);
GLIB_AVAILABLE_IN_2_34
void    g_test_assert_expected_messages_internal (const char     *domain,
                                                  const char     *file,
                                                  int             line,
                                                  const char     *func);

typedef enum
{
  G_TEST_DIST,
  G_TEST_BUILT
} GTestFileType;

GLIB_AVAILABLE_IN_2_38
gchar * g_test_build_filename                    (GTestFileType   file_type,
                                                  const gchar    *first_path,
                                                  ...) G_GNUC_NULL_TERMINATED;
GLIB_AVAILABLE_IN_2_38
const gchar *g_test_get_dir                      (GTestFileType   file_type);
GLIB_AVAILABLE_IN_2_38
const gchar *g_test_get_filename                 (GTestFileType   file_type,
                                                  const gchar    *first_path,
                                                  ...) G_GNUC_NULL_TERMINATED;

#define g_test_assert_expected_messages() g_test_assert_expected_messages_internal (G_LOG_DOMAIN, __FILE__, __LINE__, G_STRFUNC)

G_END_DECLS

#endif /* __G_TEST_UTILS_H__ */
