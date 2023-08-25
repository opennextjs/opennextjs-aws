/* Pango
 * pango-font.h: Font handling
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

#ifndef __PANGO_FONT_H__
#define __PANGO_FONT_H__

#include <pango/pango-coverage.h>
#include <pango/pango-types.h>

#include <glib-object.h>
#include <hb.h>

G_BEGIN_DECLS

/**
 * PangoFontDescription:
 *
 * A `PangoFontDescription` describes a font in an implementation-independent
 * manner.
 *
 * `PangoFontDescription` structures are used both to list what fonts are
 * available on the system and also for specifying the characteristics of
 * a font to load.
 */
typedef struct _PangoFontDescription PangoFontDescription;

/**
 * PangoFontMetrics:
 *
 * A `PangoFontMetrics` structure holds the overall metric information
 * for a font.
 *
 * The information in a `PangoFontMetrics` structure may be restricted
 * to a script. The fields of this structure are private to implementations
 * of a font backend. See the documentation of the corresponding getters
 * for documentation of their meaning.
 *
 * For an overview of the most important metrics, see:
 *
 * <picture>
 *   <source srcset="fontmetrics-dark.png" media="(prefers-color-scheme: dark)">
 *   <img alt="Font metrics" src="fontmetrics-light.png">
 * </picture>

 */
typedef struct _PangoFontMetrics PangoFontMetrics;

/**
 * PangoStyle:
 * @PANGO_STYLE_NORMAL: the font is upright.
 * @PANGO_STYLE_OBLIQUE: the font is slanted, but in a roman style.
 * @PANGO_STYLE_ITALIC: the font is slanted in an italic style.
 *
 * An enumeration specifying the various slant styles possible for a font.
 **/
typedef enum {
  PANGO_STYLE_NORMAL,
  PANGO_STYLE_OBLIQUE,
  PANGO_STYLE_ITALIC
} PangoStyle;

/**
 * PangoVariant:
 * @PANGO_VARIANT_NORMAL: A normal font.
 * @PANGO_VARIANT_SMALL_CAPS: A font with the lower case characters
 *   replaced by smaller variants of the capital characters.
 * @PANGO_VARIANT_ALL_SMALL_CAPS: A font with all characters
 *   replaced by smaller variants of the capital characters. Since: 1.50
 * @PANGO_VARIANT_PETITE_CAPS: A font with the lower case characters
 *   replaced by smaller variants of the capital characters.
 *   Petite Caps can be even smaller than Small Caps. Since: 1.50
 * @PANGO_VARIANT_ALL_PETITE_CAPS: A font with all characters
 *   replaced by smaller variants of the capital characters.
 *   Petite Caps can be even smaller than Small Caps. Since: 1.50
 * @PANGO_VARIANT_UNICASE: A font with the upper case characters
 *   replaced by smaller variants of the capital letters. Since: 1.50
 * @PANGO_VARIANT_TITLE_CAPS: A font with capital letters that
 *   are more suitable for all-uppercase titles. Since: 1.50
 *
 * An enumeration specifying capitalization variant of the font.
 */
typedef enum {
  PANGO_VARIANT_NORMAL,
  PANGO_VARIANT_SMALL_CAPS,
  PANGO_VARIANT_ALL_SMALL_CAPS,
  PANGO_VARIANT_PETITE_CAPS,
  PANGO_VARIANT_ALL_PETITE_CAPS,
  PANGO_VARIANT_UNICASE,
  PANGO_VARIANT_TITLE_CAPS
} PangoVariant;

/**
 * PangoWeight:
 * @PANGO_WEIGHT_THIN: the thin weight (= 100) Since: 1.24
 * @PANGO_WEIGHT_ULTRALIGHT: the ultralight weight (= 200)
 * @PANGO_WEIGHT_LIGHT: the light weight (= 300)
 * @PANGO_WEIGHT_SEMILIGHT: the semilight weight (= 350) Since: 1.36.7
 * @PANGO_WEIGHT_BOOK: the book weight (= 380) Since: 1.24)
 * @PANGO_WEIGHT_NORMAL: the default weight (= 400)
 * @PANGO_WEIGHT_MEDIUM: the medium weight (= 500) Since: 1.24
 * @PANGO_WEIGHT_SEMIBOLD: the semibold weight (= 600)
 * @PANGO_WEIGHT_BOLD: the bold weight (= 700)
 * @PANGO_WEIGHT_ULTRABOLD: the ultrabold weight (= 800)
 * @PANGO_WEIGHT_HEAVY: the heavy weight (= 900)
 * @PANGO_WEIGHT_ULTRAHEAVY: the ultraheavy weight (= 1000) Since: 1.24
 *
 * An enumeration specifying the weight (boldness) of a font.
 *
 * Weight is specified as a numeric value ranging from 100 to 1000.
 * This enumeration simply provides some common, predefined values.
 */
typedef enum {
  PANGO_WEIGHT_THIN = 100,
  PANGO_WEIGHT_ULTRALIGHT = 200,
  PANGO_WEIGHT_LIGHT = 300,
  PANGO_WEIGHT_SEMILIGHT = 350,
  PANGO_WEIGHT_BOOK = 380,
  PANGO_WEIGHT_NORMAL = 400,
  PANGO_WEIGHT_MEDIUM = 500,
  PANGO_WEIGHT_SEMIBOLD = 600,
  PANGO_WEIGHT_BOLD = 700,
  PANGO_WEIGHT_ULTRABOLD = 800,
  PANGO_WEIGHT_HEAVY = 900,
  PANGO_WEIGHT_ULTRAHEAVY = 1000
} PangoWeight;

/**
 * PangoStretch:
 * @PANGO_STRETCH_ULTRA_CONDENSED: ultra condensed width
 * @PANGO_STRETCH_EXTRA_CONDENSED: extra condensed width
 * @PANGO_STRETCH_CONDENSED: condensed width
 * @PANGO_STRETCH_SEMI_CONDENSED: semi condensed width
 * @PANGO_STRETCH_NORMAL: the normal width
 * @PANGO_STRETCH_SEMI_EXPANDED: semi expanded width
 * @PANGO_STRETCH_EXPANDED: expanded width
 * @PANGO_STRETCH_EXTRA_EXPANDED: extra expanded width
 * @PANGO_STRETCH_ULTRA_EXPANDED: ultra expanded width
 *
 * An enumeration specifying the width of the font relative to other designs
 * within a family.
 */
typedef enum {
  PANGO_STRETCH_ULTRA_CONDENSED,
  PANGO_STRETCH_EXTRA_CONDENSED,
  PANGO_STRETCH_CONDENSED,
  PANGO_STRETCH_SEMI_CONDENSED,
  PANGO_STRETCH_NORMAL,
  PANGO_STRETCH_SEMI_EXPANDED,
  PANGO_STRETCH_EXPANDED,
  PANGO_STRETCH_EXTRA_EXPANDED,
  PANGO_STRETCH_ULTRA_EXPANDED
} PangoStretch;

/**
 * PangoFontMask:
 * @PANGO_FONT_MASK_FAMILY: the font family is specified.
 * @PANGO_FONT_MASK_STYLE: the font style is specified.
 * @PANGO_FONT_MASK_VARIANT: the font variant is specified.
 * @PANGO_FONT_MASK_WEIGHT: the font weight is specified.
 * @PANGO_FONT_MASK_STRETCH: the font stretch is specified.
 * @PANGO_FONT_MASK_SIZE: the font size is specified.
 * @PANGO_FONT_MASK_GRAVITY: the font gravity is specified (Since: 1.16.)
 * @PANGO_FONT_MASK_VARIATIONS: OpenType font variations are specified (Since: 1.42)
 *
 * The bits in a `PangoFontMask` correspond to the set fields in a
 * `PangoFontDescription`.
 */
typedef enum {
  PANGO_FONT_MASK_FAMILY  = 1 << 0,
  PANGO_FONT_MASK_STYLE   = 1 << 1,
  PANGO_FONT_MASK_VARIANT = 1 << 2,
  PANGO_FONT_MASK_WEIGHT  = 1 << 3,
  PANGO_FONT_MASK_STRETCH = 1 << 4,
  PANGO_FONT_MASK_SIZE    = 1 << 5,
  PANGO_FONT_MASK_GRAVITY = 1 << 6,
  PANGO_FONT_MASK_VARIATIONS = 1 << 7,
} PangoFontMask;

/* CSS scale factors (1.2 factor between each size) */
/**
 * PANGO_SCALE_XX_SMALL:
 *
 * The scale factor for three shrinking steps (1 / (1.2 * 1.2 * 1.2)).
 */
/**
 * PANGO_SCALE_X_SMALL:
 *
 * The scale factor for two shrinking steps (1 / (1.2 * 1.2)).
 */
/**
 * PANGO_SCALE_SMALL:
 *
 * The scale factor for one shrinking step (1 / 1.2).
 */
/**
 * PANGO_SCALE_MEDIUM:
 *
 * The scale factor for normal size (1.0).
 */
/**
 * PANGO_SCALE_LARGE:
 *
 * The scale factor for one magnification step (1.2).
 */
/**
 * PANGO_SCALE_X_LARGE:
 *
 * The scale factor for two magnification steps (1.2 * 1.2).
 */
/**
 * PANGO_SCALE_XX_LARGE:
 *
 * The scale factor for three magnification steps (1.2 * 1.2 * 1.2).
 */
#define PANGO_SCALE_XX_SMALL ((double)0.5787037037037)
#define PANGO_SCALE_X_SMALL  ((double)0.6944444444444)
#define PANGO_SCALE_SMALL    ((double)0.8333333333333)
#define PANGO_SCALE_MEDIUM   ((double)1.0)
#define PANGO_SCALE_LARGE    ((double)1.2)
#define PANGO_SCALE_X_LARGE  ((double)1.44)
#define PANGO_SCALE_XX_LARGE ((double)1.728)

/*
 * PangoFontDescription
 */

#define PANGO_TYPE_FONT_DESCRIPTION (pango_font_description_get_type ())

PANGO_AVAILABLE_IN_ALL
GType                 pango_font_description_get_type    (void) G_GNUC_CONST;
PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_description_new         (void);
PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_description_copy        (const PangoFontDescription  *desc);
PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_description_copy_static (const PangoFontDescription  *desc);
PANGO_AVAILABLE_IN_ALL
guint                 pango_font_description_hash        (const PangoFontDescription  *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
gboolean              pango_font_description_equal       (const PangoFontDescription  *desc1,
                                                          const PangoFontDescription  *desc2) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                  pango_font_description_free        (PangoFontDescription        *desc);
PANGO_AVAILABLE_IN_ALL
void                  pango_font_descriptions_free       (PangoFontDescription       **descs,
                                                          int                          n_descs);

PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_family        (PangoFontDescription *desc,
                                                               const char           *family);
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_family_static (PangoFontDescription *desc,
                                                               const char           *family);
PANGO_AVAILABLE_IN_ALL
const char          *pango_font_description_get_family        (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_style         (PangoFontDescription *desc,
                                                               PangoStyle            style);
PANGO_AVAILABLE_IN_ALL
PangoStyle           pango_font_description_get_style         (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_variant       (PangoFontDescription *desc,
                                                               PangoVariant          variant);
PANGO_AVAILABLE_IN_ALL
PangoVariant         pango_font_description_get_variant       (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_weight        (PangoFontDescription *desc,
                                                               PangoWeight           weight);
PANGO_AVAILABLE_IN_ALL
PangoWeight          pango_font_description_get_weight        (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_stretch       (PangoFontDescription *desc,
                                                               PangoStretch          stretch);
PANGO_AVAILABLE_IN_ALL
PangoStretch         pango_font_description_get_stretch       (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void                 pango_font_description_set_size          (PangoFontDescription *desc,
                                                               gint                  size);
PANGO_AVAILABLE_IN_ALL
gint                 pango_font_description_get_size          (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_8
void                 pango_font_description_set_absolute_size (PangoFontDescription *desc,
                                                               double                size);
PANGO_AVAILABLE_IN_1_8
gboolean             pango_font_description_get_size_is_absolute (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_16
void                 pango_font_description_set_gravity       (PangoFontDescription *desc,
                                                               PangoGravity          gravity);
PANGO_AVAILABLE_IN_1_16
PangoGravity         pango_font_description_get_gravity       (const PangoFontDescription *desc) G_GNUC_PURE;

PANGO_AVAILABLE_IN_1_42
void                 pango_font_description_set_variations_static (PangoFontDescription       *desc,
                                                                   const char                 *variations);
PANGO_AVAILABLE_IN_1_42
void                 pango_font_description_set_variations    (PangoFontDescription       *desc,
                                                               const char                 *variations);
PANGO_AVAILABLE_IN_1_42
const char          *pango_font_description_get_variations    (const PangoFontDescription *desc) G_GNUC_PURE;

PANGO_AVAILABLE_IN_ALL
PangoFontMask pango_font_description_get_set_fields (const PangoFontDescription *desc) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
void          pango_font_description_unset_fields   (PangoFontDescription       *desc,
                                                     PangoFontMask               to_unset);

PANGO_AVAILABLE_IN_ALL
void pango_font_description_merge        (PangoFontDescription       *desc,
                                          const PangoFontDescription *desc_to_merge,
                                          gboolean                    replace_existing);
PANGO_AVAILABLE_IN_ALL
void pango_font_description_merge_static (PangoFontDescription       *desc,
                                          const PangoFontDescription *desc_to_merge,
                                          gboolean                    replace_existing);

PANGO_AVAILABLE_IN_ALL
gboolean pango_font_description_better_match (const PangoFontDescription *desc,
                                              const PangoFontDescription *old_match,
                                              const PangoFontDescription *new_match) G_GNUC_PURE;

PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_description_from_string (const char                  *str);
PANGO_AVAILABLE_IN_ALL
char *                pango_font_description_to_string   (const PangoFontDescription  *desc);
PANGO_AVAILABLE_IN_ALL
char *                pango_font_description_to_filename (const PangoFontDescription  *desc);

/*
 * PangoFontMetrics
 */

#define PANGO_TYPE_FONT_METRICS  (pango_font_metrics_get_type ())

struct _PangoFontMetrics
{
  /* <private> */
  guint ref_count;

  int ascent;
  int descent;
  int height;
  int approximate_char_width;
  int approximate_digit_width;
  int underline_position;
  int underline_thickness;
  int strikethrough_position;
  int strikethrough_thickness;
};

PANGO_AVAILABLE_IN_ALL
GType             pango_font_metrics_get_type                    (void) G_GNUC_CONST;
PANGO_AVAILABLE_IN_ALL
PangoFontMetrics *pango_font_metrics_ref                         (PangoFontMetrics *metrics);
PANGO_AVAILABLE_IN_ALL
void              pango_font_metrics_unref                       (PangoFontMetrics *metrics);
PANGO_AVAILABLE_IN_ALL
int               pango_font_metrics_get_ascent                  (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
int               pango_font_metrics_get_descent                 (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_44
int               pango_font_metrics_get_height                  (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
int               pango_font_metrics_get_approximate_char_width  (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_ALL
int               pango_font_metrics_get_approximate_digit_width (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_6
int               pango_font_metrics_get_underline_position      (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_6
int               pango_font_metrics_get_underline_thickness     (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_6
int               pango_font_metrics_get_strikethrough_position  (PangoFontMetrics *metrics) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_6
int               pango_font_metrics_get_strikethrough_thickness (PangoFontMetrics *metrics) G_GNUC_PURE;


/*
 * PangoFontFamily
 */

#define PANGO_TYPE_FONT_FAMILY              (pango_font_family_get_type ())
#define PANGO_FONT_FAMILY(object)           (G_TYPE_CHECK_INSTANCE_CAST ((object), PANGO_TYPE_FONT_FAMILY, PangoFontFamily))
#define PANGO_IS_FONT_FAMILY(object)        (G_TYPE_CHECK_INSTANCE_TYPE ((object), PANGO_TYPE_FONT_FAMILY))
#define PANGO_FONT_FAMILY_CLASS(klass)      (G_TYPE_CHECK_CLASS_CAST ((klass), PANGO_TYPE_FONT_FAMILY, PangoFontFamilyClass))
#define PANGO_IS_FONT_FAMILY_CLASS(klass)   (G_TYPE_CHECK_CLASS_TYPE ((klass), PANGO_TYPE_FONT_FAMILY))
#define PANGO_FONT_FAMILY_GET_CLASS(obj)    (G_TYPE_INSTANCE_GET_CLASS ((obj), PANGO_TYPE_FONT_FAMILY, PangoFontFamilyClass))

typedef struct _PangoFontFace        PangoFontFace;
typedef struct _PangoFontFamily      PangoFontFamily;
typedef struct _PangoFontFamilyClass PangoFontFamilyClass;

#ifndef PANGO_DISABLE_DEPRECATED

/**
 * PangoFontFamily:
 *
 * A `PangoFontFamily` is used to represent a family of related
 * font faces.
 *
 * The font faces in a family share a common design, but differ in
 * slant, weight, width or other aspects.
 */
struct _PangoFontFamily
{
  GObject parent_instance;
};

struct _PangoFontFamilyClass
{
  GObjectClass parent_class;

  /*< public >*/

  void  (*list_faces)      (PangoFontFamily  *family,
                            PangoFontFace  ***faces,
                            int              *n_faces);
  const char * (*get_name) (PangoFontFamily  *family);
  gboolean (*is_monospace) (PangoFontFamily *family);
  gboolean (*is_variable)  (PangoFontFamily *family);

  PangoFontFace * (*get_face) (PangoFontFamily *family,
                               const char      *name);


  /*< private >*/

  /* Padding for future expansion */
  void (*_pango_reserved2) (void);
};

#endif /* PANGO_DISABLE_DEPRECATED */

PANGO_AVAILABLE_IN_ALL
GType      pango_font_family_get_type       (void) G_GNUC_CONST;

PANGO_AVAILABLE_IN_ALL
void                 pango_font_family_list_faces (PangoFontFamily  *family,
                                                   PangoFontFace  ***faces,
                                                   int              *n_faces);
PANGO_AVAILABLE_IN_ALL
const char *pango_font_family_get_name   (PangoFontFamily  *family) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_4
gboolean   pango_font_family_is_monospace         (PangoFontFamily  *family) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_44
gboolean   pango_font_family_is_variable          (PangoFontFamily  *family) G_GNUC_PURE;

PANGO_AVAILABLE_IN_1_46
PangoFontFace *pango_font_family_get_face (PangoFontFamily *family,
                                           const char      *name);


/*
 * PangoFontFace
 */

#define PANGO_TYPE_FONT_FACE              (pango_font_face_get_type ())
#define PANGO_FONT_FACE(object)           (G_TYPE_CHECK_INSTANCE_CAST ((object), PANGO_TYPE_FONT_FACE, PangoFontFace))
#define PANGO_IS_FONT_FACE(object)        (G_TYPE_CHECK_INSTANCE_TYPE ((object), PANGO_TYPE_FONT_FACE))
#define PANGO_FONT_FACE_CLASS(klass)      (G_TYPE_CHECK_CLASS_CAST ((klass), PANGO_TYPE_FONT_FACE, PangoFontFaceClass))
#define PANGO_IS_FONT_FACE_CLASS(klass)   (G_TYPE_CHECK_CLASS_TYPE ((klass), PANGO_TYPE_FONT_FACE))
#define PANGO_FONT_FACE_GET_CLASS(obj)    (G_TYPE_INSTANCE_GET_CLASS ((obj), PANGO_TYPE_FONT_FACE, PangoFontFaceClass))

typedef struct _PangoFontFaceClass   PangoFontFaceClass;

#ifndef PANGO_DISABLE_DEPRECATED

/**
 * PangoFontFace:
 *
 * A `PangoFontFace` is used to represent a group of fonts with
 * the same family, slant, weight, and width, but varying sizes.
 */
struct _PangoFontFace
{
  GObject parent_instance;
};

struct _PangoFontFaceClass
{
  GObjectClass parent_class;

  /*< public >*/

  const char           * (*get_face_name)  (PangoFontFace *face);
  PangoFontDescription * (*describe)       (PangoFontFace *face);
  void                   (*list_sizes)     (PangoFontFace  *face,
                                            int           **sizes,
                                            int            *n_sizes);
  gboolean               (*is_synthesized) (PangoFontFace *face);
  PangoFontFamily *      (*get_family)     (PangoFontFace *face);

  /*< private >*/

  /* Padding for future expansion */
  void (*_pango_reserved3) (void);
  void (*_pango_reserved4) (void);
};

#endif /* PANGO_DISABLE_DEPRECATED */

PANGO_AVAILABLE_IN_ALL
GType      pango_font_face_get_type       (void) G_GNUC_CONST;

PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_face_describe       (PangoFontFace  *face);
PANGO_AVAILABLE_IN_ALL
const char           *pango_font_face_get_face_name  (PangoFontFace  *face) G_GNUC_PURE;
PANGO_AVAILABLE_IN_1_4
void                  pango_font_face_list_sizes     (PangoFontFace  *face,
                                                      int           **sizes,
                                                      int            *n_sizes);
PANGO_AVAILABLE_IN_1_18
gboolean              pango_font_face_is_synthesized (PangoFontFace  *face) G_GNUC_PURE;

PANGO_AVAILABLE_IN_1_46
PangoFontFamily *     pango_font_face_get_family     (PangoFontFace  *face);


/*
 * PangoFont
 */

#define PANGO_TYPE_FONT              (pango_font_get_type ())
#define PANGO_FONT(object)           (G_TYPE_CHECK_INSTANCE_CAST ((object), PANGO_TYPE_FONT, PangoFont))
#define PANGO_IS_FONT(object)        (G_TYPE_CHECK_INSTANCE_TYPE ((object), PANGO_TYPE_FONT))
#define PANGO_FONT_CLASS(klass)      (G_TYPE_CHECK_CLASS_CAST ((klass), PANGO_TYPE_FONT, PangoFontClass))
#define PANGO_IS_FONT_CLASS(klass)   (G_TYPE_CHECK_CLASS_TYPE ((klass), PANGO_TYPE_FONT))
#define PANGO_FONT_GET_CLASS(obj)    (G_TYPE_INSTANCE_GET_CLASS ((obj), PANGO_TYPE_FONT, PangoFontClass))


#ifndef PANGO_DISABLE_DEPRECATED

/**
 * PangoFont:
 *
 * A `PangoFont` is used to represent a font in a
 * rendering-system-independent manner.
 */
struct _PangoFont
{
  GObject parent_instance;
};

typedef struct _PangoFontClass       PangoFontClass;
struct _PangoFontClass
{
  GObjectClass parent_class;

  /*< public >*/

  PangoFontDescription *(*describe)           (PangoFont      *font);
  PangoCoverage *       (*get_coverage)       (PangoFont      *font,
                                               PangoLanguage  *language);
  void                  (*get_glyph_extents)  (PangoFont      *font,
                                               PangoGlyph      glyph,
                                               PangoRectangle *ink_rect,
                                               PangoRectangle *logical_rect);
  PangoFontMetrics *    (*get_metrics)        (PangoFont      *font,
                                               PangoLanguage  *language);
  PangoFontMap *        (*get_font_map)       (PangoFont      *font);
  PangoFontDescription *(*describe_absolute)  (PangoFont      *font);
  void                  (*get_features)       (PangoFont      *font,
                                               hb_feature_t   *features,
                                               guint           len,
                                               guint          *num_features);
  hb_font_t *           (*create_hb_font)     (PangoFont      *font);
};

#endif /* PANGO_DISABLE_DEPRECATED */

PANGO_AVAILABLE_IN_ALL
GType                 pango_font_get_type          (void) G_GNUC_CONST;

PANGO_AVAILABLE_IN_ALL
PangoFontDescription *pango_font_describe          (PangoFont        *font);
PANGO_AVAILABLE_IN_1_14
PangoFontDescription *pango_font_describe_with_absolute_size (PangoFont        *font);
PANGO_AVAILABLE_IN_ALL
PangoCoverage *       pango_font_get_coverage      (PangoFont        *font,
                                                    PangoLanguage    *language);
#ifndef __GI_SCANNER__
PANGO_DEPRECATED_IN_1_44
PangoEngineShape *    pango_font_find_shaper       (PangoFont        *font,
                                                    PangoLanguage    *language,
                                                    guint32           ch);
#endif
PANGO_AVAILABLE_IN_ALL
PangoFontMetrics *    pango_font_get_metrics       (PangoFont        *font,
                                                    PangoLanguage    *language);
PANGO_AVAILABLE_IN_ALL
void                  pango_font_get_glyph_extents (PangoFont        *font,
                                                    PangoGlyph        glyph,
                                                    PangoRectangle   *ink_rect,
                                                    PangoRectangle   *logical_rect);
PANGO_AVAILABLE_IN_1_10
PangoFontMap         *pango_font_get_font_map      (PangoFont        *font);

PANGO_AVAILABLE_IN_1_46
PangoFontFace *       pango_font_get_face          (PangoFont        *font);

PANGO_AVAILABLE_IN_1_44
gboolean              pango_font_has_char          (PangoFont        *font,
                                                    gunichar          wc);
PANGO_AVAILABLE_IN_1_44
void                  pango_font_get_features      (PangoFont        *font,
                                                    hb_feature_t     *features,
                                                    guint             len,
                                                    guint            *num_features);
PANGO_AVAILABLE_IN_1_44
hb_font_t *           pango_font_get_hb_font       (PangoFont        *font);

PANGO_AVAILABLE_IN_1_50
PangoLanguage **      pango_font_get_languages     (PangoFont        *font);

PANGO_AVAILABLE_IN_1_50
GBytes *              pango_font_serialize         (PangoFont        *font);

PANGO_AVAILABLE_IN_1_50
PangoFont *           pango_font_deserialize       (PangoContext     *context,
                                                    GBytes           *bytes,
                                                    GError          **error);

/**
 * PANGO_GLYPH_EMPTY:
 *
 * A `PangoGlyph` value that indicates a zero-width empty glpyh.
 *
 * This is useful for example in shaper modules, to use as the glyph for
 * various zero-width Unicode characters (those passing [func@is_zero_width]).
 */

/**
 * PANGO_GLYPH_INVALID_INPUT:
 *
 * A `PangoGlyph` value for invalid input.
 *
 * `PangoLayout` produces one such glyph per invalid input UTF-8 byte and such
 * a glyph is rendered as a crossed box.
 *
 * Note that this value is defined such that it has the %PANGO_GLYPH_UNKNOWN_FLAG
 * set.
 *
 * Since: 1.20
 */
/**
 * PANGO_GLYPH_UNKNOWN_FLAG:
 *
 * Flag used in `PangoGlyph` to turn a `gunichar` value of a valid Unicode
 * character into an unknown-character glyph for that `gunichar`.
 *
 * Such unknown-character glyphs may be rendered as a 'hex box'.
 */
/**
 * PANGO_GET_UNKNOWN_GLYPH:
 * @wc: a Unicode character
 *
 * The way this unknown glyphs are rendered is backend specific. For example,
 * a box with the hexadecimal Unicode code-point of the character written in it
 * is what is done in the most common backends.
 *
 * Returns: a `PangoGlyph` value that means no glyph was found for @wc.
 */
#define PANGO_GLYPH_EMPTY           ((PangoGlyph)0x0FFFFFFF)
#define PANGO_GLYPH_INVALID_INPUT   ((PangoGlyph)0xFFFFFFFF)
#define PANGO_GLYPH_UNKNOWN_FLAG    ((PangoGlyph)0x10000000)
#define PANGO_GET_UNKNOWN_GLYPH(wc) ((PangoGlyph)(wc)|PANGO_GLYPH_UNKNOWN_FLAG)

#ifndef __GI_SCANNER__
#ifndef PANGO_DISABLE_DEPRECATED
#define PANGO_UNKNOWN_GLYPH_WIDTH  10
#define PANGO_UNKNOWN_GLYPH_HEIGHT 14
#endif
#endif

G_DEFINE_AUTOPTR_CLEANUP_FUNC(PangoFontFamily, g_object_unref)
G_DEFINE_AUTOPTR_CLEANUP_FUNC(PangoFontFace, g_object_unref)
G_DEFINE_AUTOPTR_CLEANUP_FUNC(PangoFont, g_object_unref)
G_DEFINE_AUTOPTR_CLEANUP_FUNC(PangoFontDescription, pango_font_description_free)

G_END_DECLS

#endif /* __PANGO_FONT_H__ */
