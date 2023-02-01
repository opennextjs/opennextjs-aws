/* Pango
 * pango-coverage.h: Coverage sets for fonts
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.	 See the GNU
 * Library General Public License for more details.
 *
 * You should have received a copy of the GNU Library General Public
 * License along with this library; if not, write to the
 * Free Software Foundation, Inc., 59 Temple Place - Suite 330,
 * Boston, MA 02111-1307, USA.
 */

#ifndef __PANGO_COVERAGE_H__
#define __PANGO_COVERAGE_H__

#include <glib-object.h>

#include <pango/pango-version-macros.h>
#include <hb.h>

G_BEGIN_DECLS

/**
 * PangoCoverage:
 *
 * A `PangoCoverage` structure is a map from Unicode characters
 * to [enum@Pango.CoverageLevel] values.
 *
 * It is often necessary in Pango to determine if a particular
 * font can represent a particular character, and also how well
 * it can represent that character. The `PangoCoverage` is a data
 * structure that is used to represent that information. It is an
 * opaque structure with no public fields.
 */
typedef struct _PangoCoverage PangoCoverage;

/**
 * PangoCoverageLevel:
 * @PANGO_COVERAGE_NONE: The character is not representable with
 *   the font.
 * @PANGO_COVERAGE_FALLBACK: The character is represented in a
 *   way that may be comprehensible but is not the correct
 *   graphical form. For instance, a Hangul character represented
 *   as a a sequence of Jamos, or a Latin transliteration of a
 *   Cyrillic word.
 * @PANGO_COVERAGE_APPROXIMATE: The character is represented as
 *   basically the correct graphical form, but with a stylistic
 *   variant inappropriate for the current script.
 * @PANGO_COVERAGE_EXACT: The character is represented as the
 *   correct graphical form.
 *
 * `PangoCoverageLevel` is used to indicate how well a font can
 * represent a particular Unicode character for a particular script.
 *
 * Since 1.44, only %PANGO_COVERAGE_NONE and %PANGO_COVERAGE_EXACT
 * will be returned.
 */
typedef enum {
  PANGO_COVERAGE_NONE,
  PANGO_COVERAGE_FALLBACK,
  PANGO_COVERAGE_APPROXIMATE,
  PANGO_COVERAGE_EXACT
} PangoCoverageLevel;

PANGO_AVAILABLE_IN_ALL
GType pango_coverage_get_type (void) G_GNUC_CONST;

PANGO_AVAILABLE_IN_ALL
PangoCoverage *    pango_coverage_new     (void);
PANGO_DEPRECATED_IN_1_52_FOR(g_object_ref)
PangoCoverage *    pango_coverage_ref     (PangoCoverage      *coverage);
PANGO_DEPRECATED_IN_1_52_FOR(g_object_unref)
void               pango_coverage_unref   (PangoCoverage      *coverage);
PANGO_AVAILABLE_IN_ALL
PangoCoverage *    pango_coverage_copy    (PangoCoverage      *coverage);
PANGO_AVAILABLE_IN_ALL
PangoCoverageLevel pango_coverage_get     (PangoCoverage      *coverage,
					   int                 index_);
PANGO_AVAILABLE_IN_ALL
void               pango_coverage_set     (PangoCoverage      *coverage,
					   int                 index_,
					   PangoCoverageLevel  level);
PANGO_DEPRECATED_IN_1_44
void               pango_coverage_max     (PangoCoverage      *coverage,
					   PangoCoverage      *other);

PANGO_DEPRECATED_IN_1_44
void           pango_coverage_to_bytes   (PangoCoverage  *coverage,
					  guchar        **bytes,
					  int            *n_bytes);
PANGO_DEPRECATED_IN_1_44
PangoCoverage *pango_coverage_from_bytes (guchar         *bytes,
					  int             n_bytes);

G_DEFINE_AUTOPTR_CLEANUP_FUNC(PangoCoverage, g_object_unref)

G_END_DECLS

#endif /* __PANGO_COVERAGE_H__ */
