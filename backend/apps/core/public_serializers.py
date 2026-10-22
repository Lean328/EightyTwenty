from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers


class PublicLocationSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    sub = serializers.CharField()
    address = serializers.CharField()
    phone = serializers.CharField()
    hours = serializers.CharField()
    hoursShort = serializers.CharField()
    open = serializers.BooleanField()
    methods = serializers.ListField(child=serializers.CharField())
    note = serializers.CharField()
    wait = serializers.CharField()
    img = serializers.CharField()
    img2 = serializers.CharField()
    img3 = serializers.CharField()
    order = serializers.CharField()
    email = serializers.CharField()
    booking = serializers.CharField()
    flagship = serializers.BooleanField(required=False)
    limited = serializers.BooleanField(required=False)
    gf = serializers.BooleanField(required=False)
    tbc = serializers.BooleanField(required=False)


class PublicCategorySerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    note = serializers.CharField()


@extend_schema_field(
    {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {"oneOf": [{"type": "string"}, {"type": "number"}]},
        "description": "Tuple [option name, price delta in AUD].",
    }
)
class ModifierTupleField(serializers.Field):
    def to_representation(self, value):
        return value


class PublicModifierSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    required = serializers.BooleanField()
    max = serializers.IntegerField()
    options = serializers.ListField(child=ModifierTupleField())


class PublicMenuItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    cat = serializers.CharField()
    name = serializers.CharField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)
    priceSource = serializers.CharField(required=False)
    diet = serializers.ListField(child=serializers.CharField())
    img = serializers.CharField()
    desc = serializers.CharField()
    featured = serializers.BooleanField(required=False)
    available = serializers.BooleanField(required=False)
    mods = PublicModifierSerializer(many=True)


class PublicCateringSerializer(serializers.Serializer):
    id = serializers.CharField()
    price = serializers.CharField()
    unit = serializers.CharField()
    img = serializers.CharField()
    imagePosition = serializers.CharField()
    blurb = serializers.CharField()
    items = serializers.ListField(child=serializers.CharField())


class PublicNavigationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    menu = serializers.CharField()
    label = serializers.CharField()
    url = serializers.CharField()
    parent = serializers.UUIDField(allow_null=True)


class PublicPageSummarySerializer(serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.CharField()
    seo_title = serializers.CharField()
    seo_description = serializers.CharField()


class PublicSettingsSerializer(serializers.Serializer):
    brand_name = serializers.CharField()
    contact_email = serializers.EmailField()
    social_links = serializers.DictField(child=serializers.CharField())
    footer = serializers.CharField()
    announcement = serializers.CharField()
    navigation = PublicNavigationSerializer(many=True)
    pages = PublicPageSummarySerializer(
        many=True, help_text="Published CMS pages; fetch blocks from /public/pages/{slug}."
    )


class BootstrapSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    generatedAt = serializers.DateTimeField()
    LOCATIONS = PublicLocationSerializer(many=True)
    CATEGORIES = PublicCategorySerializer(many=True)
    MENU = PublicMenuItemSerializer(many=True)
    CATERING = PublicCateringSerializer(many=True)
    ORDER_RULES = serializers.DictField()
    SETTINGS = PublicSettingsSerializer()


class VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField()


class PublicContentBlockSerializer(serializers.Serializer):
    key = serializers.CharField()
    type = serializers.CharField()
    data = serializers.DictField()


class PublicPageSerializer(serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.CharField()
    seo_title = serializers.CharField()
    seo_description = serializers.CharField()
    blocks = PublicContentBlockSerializer(many=True)
