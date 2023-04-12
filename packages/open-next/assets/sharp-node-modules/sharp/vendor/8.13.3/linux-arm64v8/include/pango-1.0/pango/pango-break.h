/* Pango
 * pango-break.h:
 *
 * Copyright (C) 1999 Red Hat Software
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

#ifndef __PANGO_BREAK_H__
#define __PANGO_BREAK_H__

#include <glib.h>

G_BEGIN_DECLS

#include <pango/pango-item.h>

/* Logical attributes of a character.
 */
/**
 * PangoLogAttr:
 * @is_line_break: if set, can break line in front of character
 * @is_mandatory_break: if set, must break line in front of character
 * @is_char_break: if set, can break here when doing character wrapping
 * @is_white: is whitespace character
 * @is_cursor_position: if set, cursor can appear in front of character.
 *   i.e. this is a grapheme boundary, or the first character in the text.
 *   This flag implements Unicode's
 *   [Grapheme Cluster Boundaries](http://www.unicode.org/reports/tr29/)
 *   semantics.
 * @is_word_start: is first character in a word
 * @is_word_end: is first non-word char after a word
 *   Note that in degenerate cases, you could have both @is_word_start
 *   and @is_word_end set for some character.
 * @is_sentence_boundary: is a sentence boundary.
 *   There are two ways to divide sentences. The first assigns all
 *   inter-sentence whitespace/control/format chars to some sentence,
 *   so all chars are in some sentence; @is_sentence_boundary denotes
 *   the boundaries there. The second way doesn't assign
 *   between-sentence spaces, etc. to any sentence, so
 *   @is_sentence_start/@is_sentence_end mark the boundaries of those sentences.
 * @is_sentence_start: is first character in a sentence
 * @is_sentence_end: is first char after a sentence.
 *   Note that in degenerate cases, you could have both @is_sentence_start
 *   and @is_sentence_end set for some character. (e.g. no space after a
 *   period, so the next sentence starts right away)
 * @backspace_deletes_character: if set, backspace deletes one character
 *   rather than the entire grapheme cluster. This field is only meaningful
 *   on grapheme boundaries (where @is_cursor_position is set). In some languages,
 *   the full grapheme (e.g. letter + diacritics) is considered a unit, while in
 *   others, each decomposed character in the grapheme is a unit. In the default
 *   implementation of [func@break], this bit is set on all grapheme boundaries
 *   except those following Latin, Cyrillic or Greek base characters.
 * @is_expandable_space: is a whitespace character that can possibly be
 *   expanded for justification purposes. (Since: 1.18)
 * @is_word_boundary: is a word boundary, as defined by UAX#29.
 *   More specifically, means that this is not a position in the middle of a word.
 *   For example, both sides of a punctuation mark are considered word boundaries.
 *   This flag is particularly useful when selecting text word-by-word. This flag
 *   implements Unicode's [Word Boundaries](http://www.unicode.org/reports/tr29/)
 *   semantics. (Since: 1.22)
 * @break_inserts_hyphen: when breaking lines before this char, insert a hyphen.
 *   Since: 1.50
 * @break_removes_preceding: when breaking lines before this char, remove the
 *   preceding char. Since 1.50
 *
 * The `PangoLogAttr` structure stores information about the attributes of a
 * single character.
 */
struct _PangoLogAttr
{
  guint is_line_break               : 1;
  guint is_mandatory_break          : 1;
  guint is_char_break               : 1;
  guint is_white                    : 1;
  guint is_cursor_position          : 1;
  guint is_word_start               : 1;
  guint is_word_end                 : 1;
  guint is_sentence_boundary        : 1;
  guint is_sentence_start           : 1;
  guint is_sentence_end             : 1;
  guint backspace_deletes_character : 1;
  guint is_expandable_space         : 1;
  guint is_word_boundary            : 1;
  guint break_inserts_hyphen        : 1;
  guint break_removes_preceding     : 1;

  guint reserved                    : 17;
};

PANGO_DEPRECATED_IN_1_44
void                    pango_break             (const char    *text,
                                                 int            length,
                                                 PangoAnalysis *analysis,
                                                 PangoLogAttr  *attrs,
                                                 int            attrs_len);

PANGO_AVAILABLE_IN_ALL
void                    pango_get_log_attrs     (const char    *text,
                                                 int            length,
                                                 int            level,
                                                 PangoLanguage *language,
                                                 PangoLogAttr  *attrs,
                                                 int            attrs_len);

PANGO_AVAILABLE_IN_ALL
void                    pango_default_break     (const char    *text,
                                                 int            length,
                                                 PangoAnalysis *analysis,
                                                 PangoLogAttr  *attrs,
                                                 int            attrs_len);

PANGO_AVAILABLE_IN_1_44
void                    pango_tailor_break      (const char    *text,
                                                 int            length,
                                                 PangoAnalysis *analysis,
                                                 int            offset,
                                                 PangoLogAttr  *attrs,
                                                 int            attrs_len);

PANGO_AVAILABLE_IN_1_50
void                    pango_attr_break        (const char    *text,
                                                 int            length,
                                                 PangoAttrList *attr_list,
                                                 int            offset,
                                                 PangoLogAttr  *attrs,
                                                 int            attrs_len);

G_END_DECLS

#endif /* __PANGO_BREAK_H__ */
