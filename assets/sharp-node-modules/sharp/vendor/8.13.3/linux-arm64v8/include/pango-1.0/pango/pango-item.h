/* Pango
 * pango-item.h: Structure for storing run information
 *
 * Copyright (C) 2000 Red Hat Software
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Library General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Library General Public License for more details.
 *
 * You should have received a copy of the GNU Library General Public
 * License along with this library; if not, write to the
 * Free Software Foundation, Inc., 59 Temple Place - Suite 330,
 * Boston, MA 02111-1307, USA.
 */

#ifndef __PANGO_ITEM_H__
#define __PANGO_ITEM_H__

#include <pango/pango-types.h>
#include <pango/pango-attributes.h>

G_BEGIN_DECLS

typedef struct _PangoAnalysis PangoAnalysis;
typedef struct _PangoItem PangoItem;

/**
 * PANGO_ANALYSIS_FLAG_CENTERED_BASELINE:
 *
 * Whether the segment should be shifted to center around the baseline.
 *
 * This is mainly used in vertical writing directions.
 *
 * Since: 1.16
 */
#define PANGO_ANALYSIS_FLAG_CENTERED_BASELINE (1 << 0)

/**
 * PANGO_ANALYSIS_FLAG_IS_ELLIPSIS:
 *
 * Whether this run holds ellipsized text.
 *
 * Since: 1.36.7
 */
#define PANGO_ANALYSIS_FLAG_IS_ELLIPSIS (1 << 1)

/**
 * PANGO_ANALYSIS_FLAG_NEED_HYPHEN:
 *
 * Whether to add a hyphen at the end of the run during shaping.
 *
 * Since: 1.44
 */
#define PANGO_ANALYSIS_FLAG_NEED_HYPHEN (1 << 2)

/**
 * PangoAnalysis:
 * @shape_engine: unused, reserved
 * @lang_engine: unused, reserved
 * @font: the font for this segment.
 * @level: the bidirectional level for this segment.
 * @gravity: the glyph orientation for this segment (A `PangoGravity`).
 * @flags: boolean flags for this segment (Since: 1.16).
 * @script: the detected script for this segment (A `PangoScript`) (Since: 1.18).
 * @language: the detected language for this segment.
 * @extra_attrs: extra attributes for this segment.
 *
 * The `PangoAnalysis` structure stores information about
 * the properties of a segment of text.
 */
struct _PangoAnalysis
{
#ifndef __GI_SCANNER__
  PangoEngineShape *shape_engine;
  PangoEngineLang  *lang_engine;
#else
  gpointer shape_engine;
  gpointer lang_engine;
#endif
  PangoFont *font;

  guint8 level;
  guint8 gravity;
  guint8 flags;

  guint8 script;
  PangoLanguage *language;

  GSList *extra_attrs;
};

/**
 * PangoItem:
 * @offset: byte offset of the start of this item in text.
 * @length: length of this item in bytes.
 * @num_chars: number of Unicode characters in the item.
 * @char_offset: character offset of the start of this item in text. Since 1.50
 * @analysis: analysis results for the item.
 *
 * The `PangoItem` structure stores information about a segment of text.
 *
 * You typically obtain `PangoItems` by itemizing a piece of text
 * with [func@itemize].
 */
struct _PangoItem
{
  int offset;
  int length;
  int num_chars;
  PangoAnalysis analysis;
};

#define PANGO_TYPE_ITEM (pango_item_get_type ())

PANGO_AVAILABLE_IN_ALL
GType                   pango_item_get_type          (void) G_GNUC_CONST;

PANGO_AVAILABLE_IN_ALL
PangoItem *             pango_item_new               (void);
PANGO_AVAILABLE_IN_ALL
PangoItem *             pango_item_copy              (PangoItem         *item);
PANGO_AVAILABLE_IN_ALL
void                    pango_item_free              (PangoItem         *item);

PANGO_AVAILABLE_IN_ALL
PangoItem *             pango_item_split             (PangoItem         *orig,
                                                      int                split_index,
                                                      int                split_offset);

PANGO_AVAILABLE_IN_1_44
void                    pango_item_apply_attrs       (PangoItem         *item,
                                                      PangoAttrIterator *iter);

PANGO_AVAILABLE_IN_ALL
GList *                 pango_reorder_items          (GList             *items);

/* Itemization */

PANGO_AVAILABLE_IN_ALL
GList *                 pango_itemize                (PangoContext      *context,
                                                      const char        *text,
                                                      int                start_index,
                                                      int                length,
                                                      PangoAttrList     *attrs,
                                                      PangoAttrIterator *cached_iter);

PANGO_AVAILABLE_IN_1_4
GList *                 pango_itemize_with_base_dir  (PangoContext      *context,
                                                      PangoDirection     base_dir,
                                                      const char        *text,
                                                      int                start_index,
                                                      int                length,
                                                      PangoAttrList     *attrs,
                                                      PangoAttrIterator *cached_iter);


G_END_DECLS

#endif /* __PANGO_ITEM_H__ */
