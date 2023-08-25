/*
 * Copyright 2015 Lars Uebernickel
 * Copyright 2015 Ryan Lortie
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
 * You should have received a copy of the GNU Lesser General
 * Public License along with this library; if not, see <http://www.gnu.org/licenses/>.
 *
 * Authors:
 *     Lars Uebernickel <lars@uebernic.de>
 *     Ryan Lortie <desrt@desrt.ca>
 */

#ifndef __G_LIST_STORE_H__
#define __G_LIST_STORE_H__

#if !defined (__GIO_GIO_H_INSIDE__) && !defined (GIO_COMPILATION)
#error "Only <gio/gio.h> can be included directly."
#endif

#include <gio/giotypes.h>

G_BEGIN_DECLS

#define G_TYPE_LIST_STORE (g_list_store_get_type ())
GIO_AVAILABLE_IN_2_44
G_DECLARE_FINAL_TYPE(GListStore, g_list_store, G, LIST_STORE, GObject)

GIO_AVAILABLE_IN_2_44
GListStore *            g_list_store_new                                (GType       item_type);

GIO_AVAILABLE_IN_2_44
void                    g_list_store_insert                             (GListStore *store,
                                                                         guint       position,
                                                                         gpointer    item);

GIO_AVAILABLE_IN_2_44
guint                   g_list_store_insert_sorted                      (GListStore       *store,
                                                                         gpointer          item,
                                                                         GCompareDataFunc  compare_func,
                                                                         gpointer          user_data);

GIO_AVAILABLE_IN_2_46
void                   g_list_store_sort                                (GListStore       *store,
                                                                         GCompareDataFunc  compare_func,
                                                                         gpointer          user_data);

GIO_AVAILABLE_IN_2_44
void                    g_list_store_append                             (GListStore *store,
                                                                         gpointer    item);

GIO_AVAILABLE_IN_2_44
void                    g_list_store_remove                             (GListStore *store,
                                                                         guint       position);

GIO_AVAILABLE_IN_2_44
void                    g_list_store_remove_all                         (GListStore *store);

GIO_AVAILABLE_IN_2_44
void                    g_list_store_splice                             (GListStore *store,
                                                                         guint       position,
                                                                         guint       n_removals,
                                                                         gpointer   *additions,
                                                                         guint       n_additions);

GIO_AVAILABLE_IN_2_64
gboolean                g_list_store_find                               (GListStore *store,
                                                                         gpointer    item,
                                                                         guint      *position);

GIO_AVAILABLE_IN_2_64
gboolean                g_list_store_find_with_equal_func               (GListStore *store,
                                                                         gpointer    item,
                                                                         GEqualFunc  equal_func,
                                                                         guint      *position);

GIO_AVAILABLE_IN_2_74
gboolean                g_list_store_find_with_equal_func_full          (GListStore     *store,
                                                                         gpointer        item,
                                                                         GEqualFuncFull  equal_func,
                                                                         gpointer        user_data,
                                                                         guint          *position);

G_END_DECLS

#endif /* __G_LIST_STORE_H__ */
