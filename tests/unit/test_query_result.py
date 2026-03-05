from src.core.models import QueryResult


def test_resource_ids_is_list_of_str():
    r = QueryResult(response_text="ok", resource_ids=["id1", "id2"])
    assert r.resource_ids == ["id1", "id2"]
    assert all(isinstance(x, str) for x in r.resource_ids)


def test_error_field_none_by_default():
    r = QueryResult(response_text="ok", resource_ids=[])
    assert r.error is None


def test_error_field_populated_on_failure():
    r = QueryResult(
        response_text="",
        resource_ids=[],
        error="Something went wrong",
    )
    assert r.error == "Something went wrong"
